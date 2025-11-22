/**
 * Excel Formula Evaluator for Quarterly Metrics
 * Supports Excel-style formulas with IF, AND, OR, NOT, ISNUMBER, MIN, MAX, ABS, etc.
 * Supports arithmetic operations (+, -, *, /) and nested expressions.
 * Maps Q12-Q16 and P12-P16 to quarterly metrics.
 * Normalizes percentage values to decimals (e.g. 20% -> 0.2).
 */

import type { QuarterlyData } from "@shared/schema";
import { storage } from "./storage";

interface QuarterlyMetrics {
  // Current Quarter (Q) metrics
  Q12: number | null; // Sales Growth (YoY) %
  Q13: number | null; // EPS Growth (YoY) %
  Q14: number | null; // OPM %
  Q15: number | null; // Sales Growth (QoQ) %
  Q16: number | null; // EPS Growth (QoQ) %

  // Previous Quarter (P) metrics
  P12: number | null; // Sales Growth (YoY) % (previous)
  P13: number | null; // EPS Growth (YoY) % (previous)
  P14: number | null; // OPM % (previous)
  P15: number | null; // Sales Growth (QoQ) % (previous)
  P16: number | null; // EPS Growth (QoQ) % (previous)
}

type FormulaResult = string | number | boolean | null;

/**
 * Extract quarterly metrics from quarterly data
 * Normalizes percentage values to decimals (e.g., 20 -> 0.2)
 */
export function extractQuarterlyMetrics(quarterlyData: QuarterlyData[], selectedQuarters?: string[]): { metrics: QuarterlyMetrics; usedQuarters: string[] } {
  const metrics: QuarterlyMetrics = {
    Q12: null, Q13: null, Q14: null, Q15: null, Q16: null,
    P12: null, P13: null, P14: null, P15: null, P16: null,
  };

  if (!quarterlyData || quarterlyData.length === 0) {
    return { metrics, usedQuarters: [] };
  }

  // Sort quarters by date (newest first)
  let sortedDataByDate = [...quarterlyData].sort((a, b) => {
    // Assuming quarter format is like "Sep 2024", "Jun 2024"
    // We can try to parse dates, or rely on the fact that they usually come sorted or have a predictable format
    // For robustness, let's try to parse "Mon YYYY"
    const dateA = new Date(a.quarter);
    const dateB = new Date(b.quarter);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return dateB.getTime() - dateA.getTime();
    }
    // Fallback for unparseable dates, try localeCompare on quarter string
    return b.quarter.localeCompare(a.quarter);
  });

  // Filter by selected quarters if provided
  if (selectedQuarters && selectedQuarters.length > 0) {
    sortedDataByDate = sortedDataByDate.filter(q => selectedQuarters.includes(q.quarter));
  }

  // Group by quarter from the (potentially filtered and sorted) data
  const quartersMap = new Map<string, Record<string, string | null>>();
  sortedDataByDate.forEach(item => {
    if (!quartersMap.has(item.quarter)) {
      quartersMap.set(item.quarter, {});
    }
    quartersMap.get(item.quarter)![item.metricName] = item.metricValue?.toString() || null;
  });

  // Get unique quarter names from the map, sorted by date (most recent first)
  const uniqueSortedQuarterNames = Array.from(quartersMap.keys())
    .sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime();
      }
      return b.localeCompare(a);
    });

  if (uniqueSortedQuarterNames.length === 0) return { metrics, usedQuarters: [] };

  // Capture used quarters (up to 5 for Q12-Q16)
  const usedQuarters = uniqueSortedQuarterNames.slice(0, 5);

  // Get current quarter (most recent from the filtered/sorted list)
  const currentQuarterData = quartersMap.get(uniqueSortedQuarterNames[0])!;

  // Get previous quarter (if available)
  const previousQuarterData = uniqueSortedQuarterNames.length > 1 ? quartersMap.get(uniqueSortedQuarterNames[1])! : null;

  // Helper to find metric value and normalize to decimal
  const findMetric = (quarter: Record<string, string | null>, metricName: string): number | null => {
    const metric = quarter[metricName];
    if (metric === null || metric === undefined) return null;

    let num: number;

    // Handle string values with %
    if (typeof metric === 'string') {
      const cleaned = metric.replace('%', '').trim();
      num = parseFloat(cleaned);
    } else {
      num = typeof metric === 'number' ? metric : parseFloat(metric);
    }

    if (isNaN(num)) return null;

    // Normalize: assume data from DB is in percentage points (e.g., 20 for 20%)
    // We convert to decimal (0.2) for calculation consistency
    return num / 100;
  };

  // Helper to find metric by variations
  const findMetricByVariations = (quarter: Record<string, string | null>, variations: string[]): number | null => {
    // First try exact matches
    for (const variation of variations) {
      const value = findMetric(quarter, variation);
      if (value !== null) return value;
    }

    // Then try case-insensitive matching
    const quarterMetricKeys = Object.keys(quarter);
    for (const variation of variations) {
      const normalizedVariation = variation.toLowerCase().replace(/[()%]/g, '').replace(/\s+/g, '');
      for (const key of quarterMetricKeys) {
        const normalizedKey = key.toLowerCase().replace(/[()%]/g, '').replace(/\s+/g, '');
        if (normalizedKey === normalizedVariation ||
          normalizedKey.includes(normalizedVariation) ||
          normalizedVariation.includes(normalizedKey)) {
          const value = findMetric(quarter, key);
          if (value !== null) return value;
        }
      }
    }

    return null;
  };

  // Extract current quarter metrics (Q)
  metrics.Q12 = findMetricByVariations(currentQuarterData, [
    'Sales Growth(YoY) %', 'Sales Growth (YoY) %', 'Sales Growth YoY %', 'Sales YoY %', 'Revenue Growth YoY %', 'sales_yoy_percent'
  ]);
  metrics.Q13 = findMetricByVariations(currentQuarterData, [
    'EPS Growth(YoY) %', 'EPS Growth (YoY) %', 'EPS Growth YoY %', 'EPS YoY %', 'eps_yoy_percent'
  ]);
  metrics.Q14 = findMetricByVariations(currentQuarterData, [
    'OPM %', 'Operating Profit Margin %', 'Operating Margin %', 'opm_percent', 'operating_profit_margin'
  ]);
  metrics.Q15 = findMetricByVariations(currentQuarterData, [
    'Sales Growth(QoQ) %', 'Sales Growth (QoQ) %', 'Sales Growth QoQ %', 'Sales QoQ %', 'Revenue Growth QoQ %', 'sales_qoq_percent'
  ]);
  metrics.Q16 = findMetricByVariations(currentQuarterData, [
    'EPS Growth(QoQ) %', 'EPS Growth (QoQ) %', 'EPS Growth QoQ %', 'EPS QoQ %', 'eps_qoq_percent'
  ]);

  // Extract previous quarter metrics (P) if available
  if (previousQuarterData) {
    metrics.P12 = findMetricByVariations(previousQuarterData, [
      'Sales Growth(YoY) %', 'Sales Growth (YoY) %', 'Sales Growth YoY %', 'Sales YoY %', 'Revenue Growth YoY %', 'sales_yoy_percent'
    ]);
    metrics.P13 = findMetricByVariations(previousQuarterData, [
      'EPS Growth(YoY) %', 'EPS Growth (YoY) %', 'EPS Growth YoY %', 'EPS YoY %', 'eps_yoy_percent'
    ]);
    metrics.P14 = findMetricByVariations(previousQuarterData, [
      'OPM %', 'Operating Profit Margin %', 'Operating Margin %', 'opm_percent', 'operating_profit_margin'
    ]);
    metrics.P15 = findMetricByVariations(previousQuarterData, [
      'Sales Growth(QoQ) %', 'Sales Growth (QoQ) %', 'Sales Growth QoQ %', 'Sales QoQ %', 'Revenue Growth QoQ %', 'sales_qoq_percent'
    ]);
    metrics.P16 = findMetricByVariations(previousQuarterData, [
      'EPS Growth(QoQ) %', 'EPS Growth (QoQ) %', 'EPS Growth QoQ %', 'EPS QoQ %', 'eps_qoq_percent'
    ]);
  }

  return { metrics, usedQuarters };
}

// Token types
enum TokenType {
  FUNCTION,
  IDENTIFIER, // Q12, P13
  NUMBER,
  STRING,
  OPERATOR, // +, -, *, /, >, <, >=, <=, =, <>, %
  LPAREN,
  RPAREN,
  COMMA,
  EOF
}

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Evaluate Excel formula with quarterly metrics
 */
export class ExcelFormulaEvaluator {
  private metrics: QuarterlyMetrics;
  public usedQuarters: string[];
  private tokens: Token[] = [];
  private currentTokenIndex = 0;

  constructor(quarterlyData: QuarterlyData[], selectedQuarters?: string[]) {
    const extracted = extractQuarterlyMetrics(quarterlyData, selectedQuarters);
    this.metrics = extracted.metrics;
    this.usedQuarters = extracted.usedQuarters;
  }

  /**
   * Evaluate a formula string
   */
  evaluate(formula: string): FormulaResult {
    try {
      // Clean up formula
      formula = formula.trim();
      if (formula.startsWith('=')) {
        formula = formula.substring(1).trim();
      }

      this.tokenize(formula);
      const result = this.parseExpression();

      if (this.currentTokenIndex < this.tokens.length && this.tokens[this.currentTokenIndex].type !== TokenType.EOF) {
        console.warn("Formula has trailing tokens");
      }

      return result;
    } catch (error: any) {
      console.error(`Error evaluating formula: ${error.message}`);
      return null;
    }
  }

  // --- Tokenizer ---

  private tokenize(formula: string) {
    this.tokens = [];
    this.currentTokenIndex = 0;
    let i = 0;

    while (i < formula.length) {
      const char = formula[i];

      if (/\s/.test(char)) {
        i++;
        continue;
      }

      if (char === '(') {
        this.tokens.push({ type: TokenType.LPAREN, value: '(', position: i });
        i++;
      } else if (char === ')') {
        this.tokens.push({ type: TokenType.RPAREN, value: ')', position: i });
        i++;
      } else if (char === ',') {
        this.tokens.push({ type: TokenType.COMMA, value: ',', position: i });
        i++;
      } else if (['+', '-', '*', '/', '%'].includes(char)) {
        this.tokens.push({ type: TokenType.OPERATOR, value: char, position: i });
        i++;
      } else if (['>', '<', '=', '!'].includes(char)) {
        let op = char;
        if (i + 1 < formula.length && formula[i + 1] === '=') {
          op += '=';
          i++;
        } else if (char === '<' && i + 1 < formula.length && formula[i + 1] === '>') {
          op += '>';
          i++;
        }
        this.tokens.push({ type: TokenType.OPERATOR, value: op, position: i });
        i++;
      } else if (char === '"' || char === "'") {
        const quote = char;
        let str = "";
        i++;
        while (i < formula.length && formula[i] !== quote) {
          str += formula[i];
          i++;
        }
        i++; // Skip closing quote
        this.tokens.push({ type: TokenType.STRING, value: str, position: i });
      } else if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(formula[i + 1]))) {
        let numStr = "";
        while (i < formula.length && (/[0-9.]/.test(formula[i]))) {
          numStr += formula[i];
          i++;
        }
        this.tokens.push({ type: TokenType.NUMBER, value: numStr, position: i });
      } else if (/[a-zA-Z_]/.test(char)) {
        let ident = "";
        while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
          ident += formula[i];
          i++;
        }
        // Check if it's a cell ref (Q12) or function
        if (/^[QP]\d+$/i.test(ident)) {
          this.tokens.push({ type: TokenType.IDENTIFIER, value: ident.toUpperCase(), position: i });
        } else {
          this.tokens.push({ type: TokenType.FUNCTION, value: ident.toUpperCase(), position: i });
        }
      } else {
        // Unknown char
        i++;
      }
    }
    this.tokens.push({ type: TokenType.EOF, value: '', position: i });
  }

  // --- Parser ---

  private peek(): Token {
    return this.tokens[this.currentTokenIndex];
  }

  private consume(): Token {
    return this.tokens[this.currentTokenIndex++];
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type === type && (!value || token.value === value)) {
      this.consume();
      return true;
    }
    return false;
  }

  private parseExpression(): FormulaResult {
    return this.parseComparison();
  }

  private parseComparison(): FormulaResult {
    let left = this.parseAdditive();

    const token = this.peek();
    if (token.type === TokenType.OPERATOR && ['=', '>', '<', '>=', '<=', '<>', '!='].includes(token.value)) {
      const op = this.consume().value;
      const right = this.parseAdditive();
      return this.evaluateComparison(left, op, right);
    }

    return left;
  }

  private parseAdditive(): FormulaResult {
    let left = this.parseMultiplicative();

    while (this.peek().type === TokenType.OPERATOR && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseMultiplicative();
      left = this.evaluateArithmetic(left, op, right);
    }

    return left;
  }

  private parseMultiplicative(): FormulaResult {
    let left = this.parseUnary();

    while (this.peek().type === TokenType.OPERATOR && ['*', '/'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseUnary();
      left = this.evaluateArithmetic(left, op, right);
    }

    return left;
  }

  private parseUnary(): FormulaResult {
    if (this.match(TokenType.OPERATOR, '-')) {
      const val = this.parseUnary();
      if (typeof val === 'number') return -val;
      return null; // Error
    }

    let res = this.parsePrimary();

    // Handle percentage literal (e.g. 20%)
    if (this.match(TokenType.OPERATOR, '%')) {
      if (typeof res === 'number') {
        return res / 100;
      }
    }

    return res;
  }

  private parsePrimary(): FormulaResult {
    const token = this.peek();

    if (token.type === TokenType.NUMBER) {
      this.consume();
      return parseFloat(token.value);
    }

    if (token.type === TokenType.STRING) {
      this.consume();
      return token.value;
    }

    if (token.type === TokenType.IDENTIFIER) {
      this.consume();
      return this.getCellValue(token.value);
    }

    if (token.type === TokenType.FUNCTION) {
      this.consume();
      return this.parseFunctionCall(token.value);
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      if (!this.match(TokenType.RPAREN)) {
        throw new Error("Expected closing parenthesis");
      }
      return expr;
    }

    // Error or end
    return null;
  }

  private parseFunctionCall(funcName: string): FormulaResult {
    if (!this.match(TokenType.LPAREN)) {
      throw new Error(`Expected ( after function ${funcName}`);
    }

    const args: FormulaResult[] = [];
    if (this.peek().type !== TokenType.RPAREN) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    if (!this.match(TokenType.RPAREN)) {
      throw new Error(`Expected ) after function arguments`);
    }

    return this.executeFunction(funcName, args);
  }

  // --- Execution ---

  private executeFunction(name: string, args: FormulaResult[]): FormulaResult {
    switch (name) {
      case 'IF':
        if (args.length < 2) throw new Error("IF requires at least 2 arguments");
        return this.toBoolean(args[0]) ? args[1] : (args[2] ?? false);
      case 'AND':
        return args.every(arg => this.toBoolean(arg));
      case 'OR':
        return args.some(arg => this.toBoolean(arg));
      case 'NOT':
        if (args.length !== 1) throw new Error("NOT requires 1 argument");
        return !this.toBoolean(args[0]);
      case 'ISNUMBER':
        if (args.length !== 1) throw new Error("ISNUMBER requires 1 argument");
        return typeof args[0] === 'number' && !isNaN(args[0]);
      case 'MIN':
        const numsMin = args.filter(a => typeof a === 'number') as number[];
        return numsMin.length > 0 ? Math.min(...numsMin) : null;
      case 'MAX':
        const numsMax = args.filter(a => typeof a === 'number') as number[];
        return numsMax.length > 0 ? Math.max(...numsMax) : null;
      case 'ABS':
        if (args.length !== 1) throw new Error("ABS requires 1 argument");
        return typeof args[0] === 'number' ? Math.abs(args[0]) : null;
      default:
        console.warn(`Unknown function: ${name}`);
        return null;
    }
  }

  private evaluateArithmetic(left: FormulaResult, op: string, right: FormulaResult): FormulaResult {
    if (typeof left !== 'number' || typeof right !== 'number') return null;

    switch (op) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return right !== 0 ? left / right : null;
      default: return null;
    }
  }

  private evaluateComparison(left: FormulaResult, op: string, right: FormulaResult): boolean {
    // Handle percentage comparisons where one side might be a decimal and other a whole number?
    // No, we normalized everything to decimals.

    if (left === null || right === null) return false;

    if (typeof left === 'number' && typeof right === 'number') {
      // Float precision check
      const diff = left - right;
      const epsilon = 0.0000001;

      switch (op) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right - epsilon;
        case '<=': return left <= right + epsilon;
        case '=': return Math.abs(diff) < epsilon;
        case '<>':
        case '!=': return Math.abs(diff) >= epsilon;
      }
    }

    // String/Bool comparison
    switch (op) {
      case '=': return left === right;
      case '<>':
      case '!=': return left !== right;
      default: return false; // Invalid for non-numbers
    }
  }

  private getCellValue(cell: string): number | null {
    const cellUpper = cell.toUpperCase();
    const metricMap: Record<string, keyof QuarterlyMetrics> = {
      'Q12': 'Q12', 'Q13': 'Q13', 'Q14': 'Q14', 'Q15': 'Q15', 'Q16': 'Q16',
      'P12': 'P12', 'P13': 'P13', 'P14': 'P14', 'P15': 'P15', 'P16': 'P16',
    };

    const metricKey = metricMap[cellUpper];
    if (metricKey) {
      return this.metrics[metricKey];
    }

    return null;
  }

  private toBoolean(value: FormulaResult): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0 && !isNaN(value);
    if (typeof value === 'string') return value.toLowerCase() !== 'false' && value.length > 0;
    return false;
  }
}

/**
 * Evaluate Excel formula for a company by ticker
 */
export async function evaluateExcelFormulaForCompany(
  ticker: string,
  formula: string,
  selectedQuarters?: string[]
): Promise<{ result: FormulaResult; resultType: string; usedQuarters: string[] }> {
  try {
    const quarterlyData = await storage.getQuarterlyDataByTicker(ticker);

    if (!quarterlyData || quarterlyData.length === 0) {
      return { result: "No Signal", resultType: "string", usedQuarters: [] };
    }

    const evaluator = new ExcelFormulaEvaluator(quarterlyData, selectedQuarters);
    const result = evaluator.evaluate(formula);

    let resultType = "string";
    if (result === null) resultType = "null";
    else if (typeof result === "boolean") resultType = "boolean";
    else if (typeof result === "number") resultType = "number";

    return { result, resultType, usedQuarters: evaluator.usedQuarters };
  } catch (error) {
    console.error(`Error evaluating Excel formula for ${ticker}:`, error);
    return { result: null, resultType: "null", usedQuarters: [] };
  }
}
