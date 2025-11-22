import type { Company, Formula, Signal } from "@shared/schema";
import { db } from "./db";
import { signals } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
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
    const applicableFormulas = formulas
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

    for (const formula of applicableFormulas) {
      let signalValue: string | null = null;
      let numericValue: number | null = null;
      let usedQuarters: string[] = [];

      if (formula.formulaType === 'excel' || /[QP]\d+/.test(formula.condition)) {
        const evalResult = await evaluateExcelFormulaForCompany(company.ticker, formula.condition);
        usedQuarters = evalResult.usedQuarters;

        if (evalResult.result === true) {
          signalValue = formula.signal;
        } else if (typeof evalResult.result === 'string' && ['BUY', 'SELL', 'HOLD'].includes(evalResult.result)) {
          signalValue = evalResult.result;
        }

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

        return {
          signal: signalValue,
          formulaId: formula.id,
          formulaName: formula.name,
          value: formula.condition,
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
              }
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
}
