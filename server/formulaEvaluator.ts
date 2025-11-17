import type { Company, Formula, Signal } from "@shared/schema";
import { db } from "./db";
import { signals } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";

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
      
      if (![">" , "<", ">=", "<=", "=", "!="].includes(operator)) {
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

  static evaluateFormula(company: Company, formula: Formula): boolean {
    try {
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
  ): Promise<{ signal: string; formulaId: string; value: string | null } | null> {
    const applicableFormulas = formulas
      .filter(f => f.enabled)
      .filter(f => {
        if (f.scope === "global") return true;
        // For sector/company scopes, scopeValue must be populated
        if (f.scope === "sector" && f.scopeValue) return f.scopeValue === company.sectorId;
        if (f.scope === "company" && f.scopeValue) return f.scopeValue === company.id;
        return false;
      })
      .sort((a, b) => a.priority - b.priority);

    for (const formula of applicableFormulas) {
      if (this.evaluateFormula(company, formula)) {
        return {
          signal: formula.signal,
          formulaId: formula.id,
          value: formula.condition
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
        await db.transaction(async (tx) => {
          // Always delete existing signals to clear stale data
          await tx.delete(signals).where(eq(signals.companyId, company.id));
          
          // Insert new signal only if a formula matched
          if (result) {
            await tx.insert(signals).values({
              companyId: company.id,
              formulaId: result.formulaId,
              signal: result.signal,
              value: null,
              metadata: { condition: result.value, formulaName: result.formulaId }
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
