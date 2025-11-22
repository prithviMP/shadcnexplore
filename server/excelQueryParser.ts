import { db } from "./db";
import { companies, quarterlyData } from "@shared/schema";
import { sql, eq, and, or, like, not, gt, lt, gte, lte, inArray } from "drizzle-orm";
import { evaluateExcelFormulaForCompany } from "./excelFormulaEvaluator";
import { storage } from "./storage";

interface QueryResult {
  companies: any[];
  total: number;
  limit: number;
  offset: number;
}

export class ExcelQueryParser {
  /**
   * Execute a query string (Excel-like or simple)
   */
  async executeQuery(query: string, limit: number = 100, offset: number = 0): Promise<QueryResult> {
    // Check if it's a complex Excel formula that requires in-memory evaluation
    if (this.isComplexExcelQuery(query)) {
      return this.executeComplexQuery(query, limit, offset);
    }

    // Otherwise, use the SQL-based parser (simplified for now, or fallback to legacy)
    // For now, we'll assume anything not complex is a simple SQL-mappable query
    // But given the user's request, we might want to default to complex for robustness if it looks like a formula
    return this.executeComplexQuery(query, limit, offset);
  }

  /**
   * Detect if a query is a complex Excel formula
   */
  private isComplexExcelQuery(query: string): boolean {
    // Check for Q/P metrics or Excel functions
    return /[QP]\d+/.test(query) ||
      /IF\(|AND\(|OR\(|NOT\(|ISNUMBER\(|MIN\(|MAX\(|ABS\(|[\+\-\*\/]/.test(query.toUpperCase());
  }

  /**
   * Execute complex query by fetching companies and evaluating in memory
   * Note: This is resource intensive for large datasets but necessary for complex Excel logic
   */
  private async executeComplexQuery(formula: string, limit: number, offset: number): Promise<QueryResult> {
    // 1. Fetch all companies
    // Optimization: We could filter by sector if the query allows, but for general formulas we need all
    const allCompanies = await storage.getAllCompanies();

    // 2. Filter companies using the evaluator
    const matchingCompanies: any[] = [];

    // We process in chunks to avoid blocking the event loop too much
    // But for simplicity in this implementation, we'll do it sequentially
    // A better approach for production would be to use a worker or stream

    for (const company of allCompanies) {
      // Evaluate the formula for this company
      // The formula should return TRUE (or a truthy value) to include the company
      // If the formula returns a string (like "BUY"), we might need to decide if that counts as a match
      // For the user's specific formula, it returns "BUY", "Check_OPM", or "No Signal".
      // We probably want to filter where result != "No Signal" and result is not false/null

      const result = await evaluateExcelFormulaForCompany(company.ticker, formula);

      // Determine if it's a match
      let isMatch = false;

      if (typeof result === 'boolean') {
        isMatch = result;
      } else if (typeof result === 'string') {
        // If it returns a string, we assume it's a classification. 
        // We include it if it's not "No Signal" or empty
        isMatch = result !== "No Signal" && result !== "";
      } else if (typeof result === 'number') {
        isMatch = result !== 0;
      }

      if (isMatch) {
        matchingCompanies.push({
          ...company,
          _formulaResult: result // Attach the result for display
        });
      }
    }

    // 3. Paginate results
    const paginatedCompanies = matchingCompanies.slice(offset, offset + limit);

    return {
      companies: paginatedCompanies,
      total: matchingCompanies.length,
      limit,
      offset
    };
  }
}

export const excelQueryParser = new ExcelQueryParser();
