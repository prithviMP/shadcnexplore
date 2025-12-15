import type { Company, Formula, Signal, Sector } from "@shared/schema";
import { db } from "./db";
import { signals, sectors } from "@shared/schema";
import { eq, inArray, and, or, lt, isNull, sql, desc } from "drizzle-orm";
import { evaluateExcelFormulaForCompany } from "./excelFormulaEvaluator";

type ComparisonOperator = ">" | "<" | ">=" | "<=" | "=" | "!=";

interface Condition {
  field: string;
  operator: ComparisonOperator;
  value: number;
}

interface ParsedFormula {
  conditions: Condition[];
  logicOperator: "AND" | "OR";
}

export class FormulaEvaluator {
  private static FIELD_MAP: Record<string, string> = {
    roe: "roe",
    pe: "pe",
    peratio: "pe",
    debt: "debt",
    debttoe: "debt",
    debttoequity: "debt",
    revenue: "revenue",
    netincome: "netIncome",
    eps: "eps",
    marketcap: "marketCap"
  };

  static parseCondition(conditionStr: string): ParsedFormula {
    conditionStr = conditionStr.trim();

    const hasAnd = conditionStr.toLowerCase().includes(" and ");
    const hasOr = conditionStr.toLowerCase().includes(" or ");

    if (hasAnd && hasOr) {
      throw new Error("Mixed AND/OR operators not supported. Use parentheses or split into multiple formulas.");
    }

    const logicOperator: "AND" | "OR" = hasAnd ? "AND" : "OR";
    const separator = hasAnd ? / and /i : / or /i;
    const parts = conditionStr.split(separator);

    const conditions: Condition[] = parts.map(part => {
      const match = part.trim().match(/^(\w+)\s*([><=!]+)\s*(-?\d+\.?\d*)$/);

      if (!match) {
        throw new Error(`Invalid condition format: "${part}". Expected format: "field operator value" (e.g., "roe > 0.20")`);
      }

      const [, fieldRaw, operator, valueStr] = match;
      const field = this.normalizeField(fieldRaw);

      if (![">", "<", ">=", "<=", "=", "!="].includes(operator)) {
        throw new Error(`Unsupported operator: ${operator}`);
      }

      return {
        field,
        operator: operator as ComparisonOperator,
        value: parseFloat(valueStr)
      };
    });

    return { conditions, logicOperator };
  }

  private static normalizeField(field: string): string {
    const normalized = field.toLowerCase().replace(/[_\s]/g, "");
    const mapped = this.FIELD_MAP[normalized];

    if (!mapped) {
      throw new Error(`Unknown field: ${field}. Supported fields: ${Object.keys(this.FIELD_MAP).join(", ")}`);
    }

    return mapped;
  }

  private static getFieldValue(company: Company, field: string): number | null {
    if (field === "marketCap") {
      return company.marketCap ? parseFloat(company.marketCap) : null;
    }

    const financialData = company.financialData as Record<string, any> | null;
    if (!financialData) return null;

    const value = financialData[field];
    return value !== undefined && value !== null ? Number(value) : null;
  }

  private static evaluateCondition(company: Company, condition: Condition): boolean {
    const fieldValue = this.getFieldValue(company, condition.field);

    if (fieldValue === null || fieldValue === undefined) {
      return false;
    }

    switch (condition.operator) {
      case ">": return fieldValue > condition.value;
      case "<": return fieldValue < condition.value;
      case ">=": return fieldValue >= condition.value;
      case "<=": return fieldValue <= condition.value;
      case "=": return Math.abs(fieldValue - condition.value) < 0.0001;
      case "!=": return Math.abs(fieldValue - condition.value) >= 0.0001;
      default: return false;
    }
  }

  static async evaluateFormula(company: Company, formula: Formula): Promise<boolean> {
    try {
      // Check if this is an Excel formula (uses Q12-Q16, P12-P16)
      if (formula.formulaType === 'excel' ||
        /[QP]\d+/.test(formula.condition) ||
        /IF\(|AND\(|OR\(|NOT\(|ISNUMBER\(|MIN\(|ABS\(/i.test(formula.condition)) {
        // Use Excel formula evaluator
        const { result, usedQuarters } = await evaluateExcelFormulaForCompany(company.ticker, formula.condition);

        // Excel formulas return the signal directly (BUY, Check_OPM (Sell), No Signal)
        if (typeof result === 'string') {
          // If formula returns a signal string, check if it matches the formula's signal
          // For main signal formula, any non-"No Signal" result means it matched
          if (result === "No Signal") {
            return false;
          }
          // If the result is a signal string and matches the formula signal, return true
          // Otherwise, if it's a signal string, it means the condition was met
          return result === formula.signal || (result !== "No Signal" && formula.signal !== "No Signal");
        }

        // If result is boolean, return it
        if (typeof result === 'boolean') {
          return result;
        }

        return false;
      }

      // Use simple formula evaluator
      const parsed = this.parseCondition(formula.condition);

      if (parsed.logicOperator === "AND") {
        return parsed.conditions.every(cond => this.evaluateCondition(company, cond));
      } else {
        return parsed.conditions.some(cond => this.evaluateCondition(company, cond));
      }
    } catch (error) {
      console.error(`Error evaluating formula "${formula.name}":`, error);
      return false;
    }
  }

  static async generateSignalForCompany(
    company: Company,
    formulas: Formula[]
  ): Promise<{ signal: string; formulaId: string; formulaName: string; value: string | null; usedQuarters: string[] | null } | null> {
    let applicableFormulas: Formula[] = [];

    // Priority 1: Check if company has an explicitly assigned formula
    if (company.assignedFormulaId) {
      const assignedFormula = formulas.find(f => f.id === company.assignedFormulaId && f.enabled);
      if (assignedFormula) {
        applicableFormulas = [assignedFormula];
      }
    }

    // Priority 2: Check if company's sector has an assigned formula
    if (applicableFormulas.length === 0 && company.sectorId) {
      const sectorResult = await db.select().from(sectors).where(eq(sectors.id, company.sectorId)).limit(1);
      const sector = sectorResult[0];
      
      if (sector?.assignedFormulaId) {
        const sectorFormula = formulas.find(f => f.id === sector.assignedFormulaId && f.enabled);
        if (sectorFormula) {
          applicableFormulas = [sectorFormula];
        }
      }
    }

    // Priority 3: Fall back to existing scope-based formula selection
    if (applicableFormulas.length === 0) {
      applicableFormulas = formulas
        .filter(f => f.enabled)
        .filter(f => {
          if (f.scope === "global") return true;
          // For sector/company scopes, scopeValue must be populated
          if (f.scope === "sector" && f.scopeValue) return f.scopeValue === company.sectorId;
          if (f.scope === "company" && f.scopeValue) return f.scopeValue === company.id;
          return false;
        })
        .sort((a, b) => {
          // First sort by scope specificity: company > sector > global
          const scopeScore = (scope: string) => {
            if (scope === "company") return 3;
            if (scope === "sector") return 2;
            return 1;
          };

          const scoreA = scopeScore(a.scope);
          const scoreB = scopeScore(b.scope);

          if (scoreA !== scoreB) {
            return scoreB - scoreA; // Higher score first
          }

          // Then sort by priority (lower number = higher priority)
          return a.priority - b.priority;
        });
    }

    for (const formula of applicableFormulas) {
      let signalValue: string | null = null;
      let numericValue: number | null = null;
      let usedQuarters: string[] = [];

      if (formula.formulaType === 'excel' || /[QP]\d+/.test(formula.condition)) {
        const evalResult = await evaluateExcelFormulaForCompany(company.ticker, formula.condition);
        usedQuarters = evalResult.usedQuarters;

        // 1) Boolean result – use the formula's configured signal label
        if (evalResult.result === true) {
          signalValue = formula.signal;
        }
        // 2) String result – accept any non-empty label except explicit "No Signal"
        else if (typeof evalResult.result === 'string') {
          const s = evalResult.result.trim();
          if (s !== '' && s !== 'No Signal') {
            signalValue = s;
          }
        }

        // 3) Numeric result – keep numeric value as score
        if (typeof evalResult.result === 'number') {
          numericValue = evalResult.result;
        }
      } else {
        // Simple formula evaluation
        try {
          const parsed = this.parseCondition(formula.condition);
          let result = false;
          if (parsed.logicOperator === "AND") {
            result = parsed.conditions.every(cond => this.evaluateCondition(company, cond));
          } else {
            result = parsed.conditions.some(cond => this.evaluateCondition(company, cond));
          }

          if (result) {
            signalValue = formula.signal;
          }
        } catch (e) {
          console.error(`Error evaluating simple formula ${formula.name}:`, e);
        }
      }

      if (signalValue) {
        // For Excel formulas, get the actual signal result
        // This block is now redundant as signalValue is already determined above
        // if (formula.formulaType === 'excel' || /[QP]\d+/.test(formula.condition)) {
        //   const excelResult = await evaluateExcelFormulaForCompany(company.ticker, formula.condition);
        //   const signalValue = typeof excelResult.result === 'string' ? excelResult.result : formula.signal;
        //   return {
        //     signal: signalValue,
        //     formulaId: formula.id,
        //     value: formula.condition,
        //     usedQuarters: excelResult.usedQuarters
        //   };
        // }

        // Ensure that value is numeric (as string) or null, to match DB decimal column
        const valueString = numericValue !== null ? numericValue.toString() : null;

        return {
          signal: signalValue,
          formulaId: formula.id,
          formulaName: formula.name,
          value: valueString,
          usedQuarters: usedQuarters.length > 0 ? usedQuarters : null
        };
      }
    }

    return null;
  }

  static async calculateAndStoreSignals(companyIds?: string[]): Promise<number> {
    const { formulas: formulasTable, companies } = await import("@shared/schema");

    const allFormulas = await db
      .select()
      .from(formulasTable)
      .where(eq(formulasTable.enabled, true));

    let companiesToProcess: Company[];

    if (companyIds && companyIds.length > 0) {
      companiesToProcess = await db
        .select()
        .from(companies)
        .where(inArray(companies.id, companyIds));

      // Validate all company IDs exist
      if (companiesToProcess.length !== companyIds.length) {
        const foundIds = companiesToProcess.map(c => c.id);
        const missingIds = companyIds.filter(id => !foundIds.includes(id));
        throw new Error(`Companies not found: ${missingIds.join(', ')}`);
      }
    } else {
      companiesToProcess = await db.select().from(companies);
    }

    let signalsGenerated = 0;

    for (const company of companiesToProcess) {
      try {
        // Evaluate formula first (outside transaction to preserve signals on error)
        const result = await this.generateSignalForCompany(company, allFormulas);

        // Only reconcile if evaluation succeeded
        await db.transaction(async (tx: any) => {
          // Delete existing signals for formulas that matched (to avoid duplicates)
          if (result) {
            await tx.delete(signals).where(
              and(
                eq(signals.companyId, company.id),
                eq(signals.formulaId, result.formulaId)
              )
            );
          } else {
            // If no signal, delete all signals for this company (optional - comment out if you want to keep old signals)
            // await tx.delete(signals).where(eq(signals.companyId, company.id));
          }

          // Insert new signal only if a formula matched
          if (result) {
            await tx.insert(signals).values({
              companyId: company.id,
              formulaId: result.formulaId,
              signal: result.signal,
              value: null,
              metadata: {
                condition: result.value,
                formulaName: result.formulaName,
                usedQuarters: result.usedQuarters
              },
              updatedAt: new Date()
            });
            signalsGenerated++;
          }
        });
      } catch (error) {
        // Preserve existing signals on evaluation error
        console.error(`Failed to evaluate signals for company ${company.id}:`, error);
        // Continue processing other companies
      }
    }

    return signalsGenerated;
  }

  /**
   * Find companies with stale signals (where company data was updated after signal was calculated)
   * or companies without any signals
   */
  static async findStaleSignalCompanies(): Promise<Company[]> {
    const { companies: companiesTable, signals: signalsTable } = await import("@shared/schema");

    // Find companies where:
    // 1. Company has no signals at all, OR
    // 2. Company's updatedAt > signal's updatedAt (data changed after signal calculation)
    const staleCompanies = await db
      .select({
        id: companiesTable.id,
        ticker: companiesTable.ticker,
        name: companiesTable.name,
        sectorId: companiesTable.sectorId,
        marketCap: companiesTable.marketCap,
        financialData: companiesTable.financialData,
        createdAt: companiesTable.createdAt,
        updatedAt: companiesTable.updatedAt,
      })
      .from(companiesTable)
      .leftJoin(
        signalsTable,
        eq(companiesTable.id, signalsTable.companyId)
      )
      .where(
        or(
          // No signal exists for this company
          isNull(signalsTable.id),
          // Signal exists but company was updated after signal was calculated
          lt(signalsTable.updatedAt, companiesTable.updatedAt)
        )
      )
      .groupBy(
        companiesTable.id,
        companiesTable.ticker,
        companiesTable.name,
        companiesTable.sectorId,
        companiesTable.marketCap,
        companiesTable.financialData,
        companiesTable.createdAt,
        companiesTable.updatedAt
      );

    return staleCompanies as Company[];
  }

  /**
   * Calculate signals only for companies with stale data
   * This is the incremental calculation method
   */
  static async calculateStaleSignals(batchSize?: number): Promise<{ processed: number; signalsGenerated: number }> {
    const staleCompanies = await this.findStaleSignalCompanies();
    
    if (staleCompanies.length === 0) {
      return { processed: 0, signalsGenerated: 0 };
    }

    // Process in batches if batchSize is specified
    const companiesToProcess = batchSize 
      ? staleCompanies.slice(0, batchSize)
      : staleCompanies;

    const companyIds = companiesToProcess.map(c => c.id);
    const signalsGenerated = await this.calculateAndStoreSignals(companyIds);

    return {
      processed: companiesToProcess.length,
      signalsGenerated
    };
  }
}
