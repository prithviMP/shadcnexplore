import type { Company, Formula, Signal, Sector } from "@shared/schema";
import { db } from "./db";
import { signals, sectors } from "@shared/schema";
import { eq, inArray, and, or, lt, isNull, sql, desc } from "drizzle-orm";
import { evaluateExcelFormulaForCompany } from "./excelFormulaEvaluator";
import { storage } from "./storage";

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
  ): Promise<{ signal: string; formulaId: string; formulaName: string; value: string | null; condition: string; usedQuarters: string[] | null } | null> {
    console.log(`[SIGNAL] Starting signal generation for company: ${company.ticker} (${company.id})`);
    console.log(`[SIGNAL] Total enabled formulas available: ${formulas.filter(f => f.enabled).length}`);
    
    let applicableFormulas: Formula[] = [];

    // Priority 1: Check if company has an explicitly assigned formula
    if (company.assignedFormulaId) {
      console.log(`[SIGNAL] Company has assigned formula ID: ${company.assignedFormulaId}`);
      const assignedFormula = formulas.find(f => f.id === company.assignedFormulaId && f.enabled);
      if (assignedFormula) {
        console.log(`[SIGNAL] Found assigned formula: ${assignedFormula.name} (${assignedFormula.id})`);
        applicableFormulas = [assignedFormula];
      } else {
        console.log(`[SIGNAL] Assigned formula ID ${company.assignedFormulaId} not found or not enabled`);
      }
    }

    // Priority 2: Check if company's sector has an assigned formula
    if (applicableFormulas.length === 0 && company.sectorId) {
      console.log(`[SIGNAL] Checking sector formula for sector ID: ${company.sectorId}`);
      const sectorResult = await db.select().from(sectors).where(eq(sectors.id, company.sectorId)).limit(1);
      const sector = sectorResult[0];
      
      if (sector?.assignedFormulaId) {
        console.log(`[SIGNAL] Sector has assigned formula ID: ${sector.assignedFormulaId}`);
        const sectorFormula = formulas.find(f => f.id === sector.assignedFormulaId && f.enabled);
        if (sectorFormula) {
          console.log(`[SIGNAL] Found sector formula: ${sectorFormula.name} (${sectorFormula.id})`);
          applicableFormulas = [sectorFormula];
        } else {
          console.log(`[SIGNAL] Sector formula ID ${sector.assignedFormulaId} not found or not enabled`);
        }
      } else {
        console.log(`[SIGNAL] Sector does not have an assigned formula`);
      }
    }

    // Priority 3: Fall back to global formulas (use the one with lowest priority number, i.e., highest priority)
    if (applicableFormulas.length === 0) {
      console.log(`[SIGNAL] No company/sector assignment found, using global formulas`);
      const enabledFormulas = formulas.filter(f => f.enabled);
      console.log(`[SIGNAL] Enabled formulas: ${enabledFormulas.map(f => `${f.name} (${f.scope}${f.scopeValue ? `:${f.scopeValue}` : ''}, priority:${f.priority})`).join(', ')}`);
      
      // Get global formulas only, sorted by priority (lower number = higher priority)
      const globalFormulas = enabledFormulas
        .filter(f => f.scope === "global")
        .sort((a, b) => a.priority - b.priority); // Lower priority number = higher priority
      
      if (globalFormulas.length > 0) {
        applicableFormulas = [globalFormulas[0]]; // Use the highest priority global formula (lowest priority number)
        console.log(`[SIGNAL] Selected global formula: "${applicableFormulas[0].name}" (priority: ${applicableFormulas[0].priority})`);
      } else {
        console.log(`[SIGNAL] No enabled global formulas found`);
      }
    }

    if (applicableFormulas.length === 0) {
      console.log(`[SIGNAL] No applicable formulas found for company ${company.ticker}`);
      return null;
    }

    // Evaluate the formula (there should only be one now, but we loop for consistency with the original logic)
    for (const formula of applicableFormulas) {
      console.log(`[SIGNAL] Evaluating formula: ${formula.name} (${formula.id})`);
      console.log(`[SIGNAL] Formula type: ${formula.formulaType}, Condition: ${formula.condition.substring(0, 100)}${formula.condition.length > 100 ? '...' : ''}`);
      
      let signalValue: string | null = null;
      let numericValue: number | null = null;
      let usedQuarters: string[] = [];

      if (formula.formulaType === 'excel' || /[QP]\d+/.test(formula.condition)) {
        console.log(`[SIGNAL] Using Excel formula evaluator for ticker: ${company.ticker}`);
        // Get quarterly data
        const quarterlyData = await storage.getQuarterlyDataByTicker(company.ticker);
        const uniqueQuarters = Array.from(new Set(quarterlyData.map(d => d.quarter)));
        const sortedQuarters = uniqueQuarters.sort((a, b) => {
          const dateA = new Date(a);
          const dateB = new Date(b);
          if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            return dateB.getTime() - dateA.getTime(); // Descending (Newest first)
          }
          return b.localeCompare(a);
        });
        
        // Use the same logic as the spreadsheet: always use last 12 quarters (or all if less than 12)
        // Q12 refers to the 12th quarter position (the newest/latest quarter when you have 12+ quarters)
        // This ensures Q12 always maps to the latest quarter data, matching spreadsheet behavior
        // Quarters are sorted newest first, so slice(0, 12) gives the newest 12 quarters
        const quartersToUse = sortedQuarters.length > 12 
          ? sortedQuarters.slice(0, 12)  // Use newest 12 quarters (so Q12 = index 0 = newest)
          : sortedQuarters;               // Use all available quarters if less than 12
        console.log(`[SIGNAL] Using ${quartersToUse.length} quarters (newest first, matching spreadsheet logic)`);
        console.log(`[SIGNAL] Quarters: ${quartersToUse.slice(0, 3).join(', ')}${quartersToUse.length > 3 ? '...' : ''} (out of ${sortedQuarters.length} total available)`);
        console.log(`[SIGNAL] Note: Q12 maps to newest quarter (index 0), Q1 maps to oldest of these ${quartersToUse.length} quarters`);
        
        const evalResult = await evaluateExcelFormulaForCompany(company.ticker, formula.condition, quartersToUse);
        console.log(`[SIGNAL] Excel formula result: ${JSON.stringify(evalResult.result)} (type: ${evalResult.resultType})`);
        console.log(`[SIGNAL] Used quarters: ${evalResult.usedQuarters.join(', ')}`);
        usedQuarters = evalResult.usedQuarters;

        // 1) Boolean result – use the formula's configured signal label
        if (evalResult.result === true) {
          signalValue = formula.signal;
          console.log(`[SIGNAL] Boolean result is true, using formula signal: ${signalValue}`);
        }
        // 2) String result – accept any non-empty label except explicit "No Signal"
        else if (typeof evalResult.result === 'string') {
          const s = evalResult.result.trim();
          console.log(`[SIGNAL] String result: "${s}"`);
          if (s !== '' && s !== 'No Signal') {
            signalValue = s;
            console.log(`[SIGNAL] Using string result as signal: ${signalValue}`);
          } else {
            console.log(`[SIGNAL] String result is empty or "No Signal", skipping`);
          }
        }

        // 3) Numeric result – keep numeric value as score
        if (typeof evalResult.result === 'number') {
          numericValue = evalResult.result;
          console.log(`[SIGNAL] Numeric result: ${numericValue}`);
        }
      } else {
        // Simple formula evaluation
        console.log(`[SIGNAL] Using simple formula evaluator`);
        try {
          const parsed = this.parseCondition(formula.condition);
          let result = false;
          if (parsed.logicOperator === "AND") {
            result = parsed.conditions.every(cond => this.evaluateCondition(company, cond));
          } else {
            result = parsed.conditions.some(cond => this.evaluateCondition(company, cond));
          }

          console.log(`[SIGNAL] Simple formula result: ${result}`);
          if (result) {
            signalValue = formula.signal;
            console.log(`[SIGNAL] Condition matched, using formula signal: ${signalValue}`);
          }
        } catch (e) {
          console.error(`[SIGNAL] Error evaluating simple formula ${formula.name}:`, e);
        }
      }

      if (signalValue) {
        console.log(`[SIGNAL] ✓ Signal generated: ${signalValue} for company ${company.ticker} using formula ${formula.name}`);
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
          condition: formula.condition, // Store the formula condition string
          usedQuarters: usedQuarters.length > 0 ? usedQuarters : null
        };
      } else {
        console.log(`[SIGNAL] Formula ${formula.name} did not generate a signal value`);
      }
    }

    console.log(`[SIGNAL] ✗ No signal generated for company ${company.ticker} after evaluating ${applicableFormulas.length} formula(s)`);
    return null;
  }

  static async calculateAndStoreSignals(companyIds?: string[]): Promise<number> {
    console.log(`[SIGNAL-CALC] Starting signal calculation${companyIds ? ` for ${companyIds.length} specific companies` : ' for all companies'}`);
    const { formulas: formulasTable, companies } = await import("@shared/schema");

    const allFormulas = await db
      .select()
      .from(formulasTable)
      .where(eq(formulasTable.enabled, true));

    console.log(`[SIGNAL-CALC] Found ${allFormulas.length} enabled formula(s): ${allFormulas.map(f => f.name).join(', ')}`);

    let companiesToProcess: Company[];

    if (companyIds && companyIds.length > 0) {
      console.log(`[SIGNAL-CALC] Processing specific company IDs: ${companyIds.join(', ')}`);
      companiesToProcess = await db
        .select()
        .from(companies)
        .where(inArray(companies.id, companyIds));

      // Validate all company IDs exist
      if (companiesToProcess.length !== companyIds.length) {
        const foundIds = companiesToProcess.map(c => c.id);
        const missingIds = companyIds.filter(id => !foundIds.includes(id));
        console.error(`[SIGNAL-CALC] Error: Companies not found: ${missingIds.join(', ')}`);
        throw new Error(`Companies not found: ${missingIds.join(', ')}`);
      }
      console.log(`[SIGNAL-CALC] Found ${companiesToProcess.length} companies to process`);
    } else {
      companiesToProcess = await db.select().from(companies);
      console.log(`[SIGNAL-CALC] Processing all ${companiesToProcess.length} companies`);
    }

    let signalsGenerated = 0;
    let companiesProcessed = 0;
    let companiesWithErrors = 0;
    let companiesWithNoFormula = 0;
    let companiesWithNoSignalResult = 0;

    // Log first company's detailed evaluation for debugging (only for first company to avoid spam)
    let firstCompanyLogged = false;

    for (const company of companiesToProcess) {
      companiesProcessed++;
      const isFirstCompany = !firstCompanyLogged;
      if (isFirstCompany) {
        console.log(`[SIGNAL-CALC] Processing company ${companiesProcessed}/${companiesToProcess.length}: ${company.ticker} (${company.id}) - DETAILED LOGS FOR FIRST COMPANY`);
        firstCompanyLogged = true;
      } else if (companiesProcessed % 50 === 0) {
        console.log(`[SIGNAL-CALC] Processing company ${companiesProcessed}/${companiesToProcess.length}: ${company.ticker} (${company.id})`);
      }
      try {
        // Evaluate formula first (outside transaction to preserve signals on error)
        const result = await this.generateSignalForCompany(company, allFormulas);

        // Only reconcile if evaluation succeeded
        await db.transaction(async (tx: any) => {
          // Always delete ALL existing signals for this company first (one signal per company)
          // This ensures we don't accumulate signals from old formulas
          await tx.delete(signals).where(eq(signals.companyId, company.id));
          
          if (result) {
            if (isFirstCompany) {
              console.log(`[SIGNAL-CALC] ✓ First company generated signal "${result.signal}" using formula ${result.formulaName}`);
            }

          // Insert new signal only if a formula matched
            await tx.insert(signals).values({
              companyId: company.id,
              formulaId: result.formulaId,
              signal: result.signal,
              value: null,
              metadata: {
                condition: result.condition, // Store the formula condition string, not the numeric value
                formulaName: result.formulaName,
                usedQuarters: result.usedQuarters
              },
              updatedAt: new Date()
            });
            signalsGenerated++;
            if (signalsGenerated <= 5) {
              console.log(`[SIGNAL-CALC] ✓ Signal stored for ${company.ticker}: "${result.signal}" using formula "${result.formulaName}"`);
            }
          } else {
            companiesWithNoSignalResult++;
            if (isFirstCompany) {
              console.log(`[SIGNAL-CALC] ⚠ First company ${company.ticker} had no signal result - check formula evaluation logs above`);
            }
            // Signal already deleted above, so company will have no signals (which is correct for "No Signal")
          }
        });
      } catch (error) {
        // Preserve existing signals on evaluation error
        companiesWithErrors++;
        console.error(`[SIGNAL-CALC] ✗ Failed to evaluate signals for company ${company.ticker} (${company.id}):`, error);
        if (error instanceof Error) {
          console.error(`[SIGNAL-CALC] Error message: ${error.message}`);
          if (isFirstCompany) {
            console.error(`[SIGNAL-CALC] Error stack: ${error.stack}`);
          }
        }
        // Continue processing other companies
      }
    }

    console.log(`\n[SIGNAL-CALC] ========== Signal calculation summary ==========`);
    console.log(`[SIGNAL-CALC] Enabled formulas found: ${allFormulas.length} (${allFormulas.map(f => f.name).join(', ')})`);
    console.log(`[SIGNAL-CALC] Companies processed: ${companiesProcessed}`);
    console.log(`[SIGNAL-CALC] Signals generated: ${signalsGenerated}`);
    console.log(`[SIGNAL-CALC] Companies with no signal result: ${companiesWithNoSignalResult}`);
    console.log(`[SIGNAL-CALC] Companies with errors: ${companiesWithErrors}`);
    
    if (allFormulas.length === 0) {
      console.log(`[SIGNAL-CALC] ⚠ WARNING: No enabled formulas found! Please enable at least one formula.`);
    } else if (signalsGenerated === 0 && companiesWithNoSignalResult === companiesProcessed) {
      console.log(`[SIGNAL-CALC] ⚠ WARNING: All companies processed but no signals generated. Check:`);
      console.log(`[SIGNAL-CALC]   1. Do formulas have the correct scope (global, sector, or company)?`);
      console.log(`[SIGNAL-CALC]   2. Do companies have assigned formulas or sectors?`);
      console.log(`[SIGNAL-CALC]   3. Are formulas evaluating correctly? Check first company logs above.`);
    }
    console.log(`[SIGNAL-CALC] ==================================================\n`);
    
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
