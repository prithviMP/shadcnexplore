/**
 * Excel Formula Evaluator for Quarterly Metrics
 * Supports Excel-style formulas with IF, AND, OR, NOT, ISNUMBER, MIN, MAX, ABS, etc.
 * Supports arithmetic operations (+, -, *, /) and nested expressions.
 * Supports dynamic metric referencing using MetricName[Qn] syntax.
 * Q1 = Most Recent Quarter, Q2 = Previous Quarter, etc.
 * Normalizes percentage values to decimals (e.g. 20% -> 0.2).
 * 
 * Supported Functions:
 * - Logical: IF, AND, OR, NOT, ISNUMBER, ISBLANK
 * - Math: MIN, MAX, ABS, SUM, AVERAGE, COUNT, ROUND, ROUNDUP, ROUNDDOWN, SQRT, POWER, LOG, CEILING, FLOOR
 * - Text: TRIM, CONCAT, CONCATENATE
 * - Error Handling: IFERROR, NOTNULL, COALESCE
 * - Conditional: SUMIF, COUNTIF
 */

import type { QuarterlyData } from "@shared/schema";
import { storage } from "./storage";

type FormulaResult = string | number | boolean | null;

// Map of Quarter Name -> Metric Name -> Value
type QuarterlyDataMap = Map<string, Map<string, number | null>>;

/**
 * Extract quarterly metrics from quarterly data
 * Returns a structured map for easy lookup
 */
export function extractQuarterlyMetrics(quarterlyData: QuarterlyData[], selectedQuarters?: string[]): { dataMap: QuarterlyDataMap; sortedQuarters: string[] } {
  const dataMap: QuarterlyDataMap = new Map();

  if (!quarterlyData || quarterlyData.length === 0) {
    return { dataMap, sortedQuarters: [] };
  }

  // Sort quarters by date (newest first)
  // This is CRITICAL for the Q1, Q2, Q3 indexing
  const uniqueQuarters = Array.from(new Set(quarterlyData.map(d => d.quarter)));

  const sortedQuarters = uniqueQuarters.sort((a, b) => {
    // Try to parse dates
    const dateA = new Date(a);
    const dateB = new Date(b);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return dateB.getTime() - dateA.getTime(); // Descending (Newest first)
    }
    // Fallback
    return b.localeCompare(a);
  });

  // Filter if needed
  const quartersToUse = selectedQuarters && selectedQuarters.length > 0
    ? sortedQuarters.filter(q => selectedQuarters.includes(q))
    : sortedQuarters;

  // Build the map
  quartersToUse.forEach(quarter => {
    const quarterMetrics = new Map<string, number | null>();

    quarterlyData
      .filter(d => d.quarter === quarter)
      .forEach(item => {
        const val = normalizeValue(item.metricValue, item.metricName);
        quarterMetrics.set(item.metricName, val);
        // Also add normalized keys for easier lookup (lowercase, no spaces)
        quarterMetrics.set(normalizeKey(item.metricName), val);
      });

    dataMap.set(quarter, quarterMetrics);
  });

  return { dataMap, sortedQuarters: quartersToUse };
}

function normalizeValue(val: string | number | null | undefined, metricName?: string): number | null {
  if (val === null || val === undefined) return null;

  let num: number;
  let wasPercentageString = false;
  if (typeof val === 'string') {
    wasPercentageString = val.includes('%');
    const cleaned = val.replace('%', '').trim();
    num = parseFloat(cleaned);
  } else {
    num = val;
  }

  if (isNaN(num)) return null;

  // Only divide by 100 if this is a percentage metric
  // Check: 1) original string had %, 2) metric name contains %, or 3) metric name indicates percentage (Growth, YoY, QoQ for growth metrics)
  const isPercentageMetric = wasPercentageString || 
    (metricName && (
      metricName.includes('%') || 
      metricName.includes('Growth') ||
      metricName.includes('YoY') ||
      metricName.includes('QoQ') ||
      metricName.toLowerCase().includes('opm') ||
      metricName.toLowerCase().includes('margin')
    ));

  if (isPercentageMetric) {
    // For percentage metrics: DB stores 20 for 20%, convert to decimal 0.2
    return num / 100;
  }

  // For non-percentage metrics (Sales, Net Profit, EPS, etc.), return as-is
  return num;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[()%]/g, '').replace(/\s+/g, '');
}

// Token types
enum TokenType {
  FUNCTION,
  IDENTIFIER, // Metric Name
  NUMBER,
  STRING,
  OPERATOR, // +, -, *, /, >, <, >=, <=, =, <>, %
  LPAREN,
  RPAREN,
  LBRACKET, // [
  RBRACKET, // ]
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
  private dataMap: QuarterlyDataMap;
  public sortedQuarters: string[]; // Q1 is index 0
  private tokens: Token[] = [];
  private currentTokenIndex = 0;

  constructor(quarterlyData: QuarterlyData[], selectedQuarters?: string[]) {
    const extracted = extractQuarterlyMetrics(quarterlyData, selectedQuarters);
    this.dataMap = extracted.dataMap;
    this.sortedQuarters = extracted.sortedQuarters;
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

      // Convert null to "No Signal" to ensure we always return a meaningful result
      return result === null || result === undefined ? "No Signal" : result;
    } catch (error: any) {
      console.error(`Error evaluating formula: ${error.message}`);
      return "No Signal";
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
      } else if (char === '[') {
        this.tokens.push({ type: TokenType.LBRACKET, value: '[', position: i });
        i++;
      } else if (char === ']') {
        this.tokens.push({ type: TokenType.RBRACKET, value: ']', position: i });
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

        // Check if it's a known function
        const upperIdent = ident.toUpperCase();
        const knownFunctions = [
          'IF', 'AND', 'OR', 'NOT', 'ISNUMBER', 'ISBLANK',
          'MIN', 'MAX', 'ABS', 'SUM', 'AVERAGE', 'COUNT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN',
          'SQRT', 'POWER', 'LOG', 'CEILING', 'FLOOR',
          'TRIM', 'CONCAT', 'CONCATENATE',
          'IFERROR', 'NOTNULL', 'COALESCE',
          'SUMIF', 'COUNTIF'
        ];
        if (knownFunctions.includes(upperIdent)) {
          this.tokens.push({ type: TokenType.FUNCTION, value: upperIdent, position: i });
        } else {
          // Otherwise treat as Identifier (Metric Name)
          // We don't uppercase here because metric names might be case sensitive or we handle it later
          this.tokens.push({ type: TokenType.IDENTIFIER, value: ident, position: i });
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
      // Look ahead for [
      if (this.match(TokenType.LBRACKET)) {
        // Expect Q + number or just number?
        // Let's support Q1, Q2 or just 1, 2
        let quarterIndex = 0;
        const indexToken = this.peek();

        if (indexToken.type === TokenType.IDENTIFIER && indexToken.value.toUpperCase().startsWith('Q')) {
          // Handle Q1, Q2...
          const numPart = indexToken.value.substring(1);
          quarterIndex = parseInt(numPart);
          this.consume();
        } else if (indexToken.type === TokenType.IDENTIFIER && indexToken.value.toUpperCase().startsWith('P')) {
          // Handle P1, P2... (Previous quarters)
          // P1 = Q2, P2 = Q3...
          const numPart = indexToken.value.substring(1);
          quarterIndex = parseInt(numPart) + 1;
          this.consume();
        } else if (indexToken.type === TokenType.NUMBER) {
          quarterIndex = parseInt(indexToken.value);
          this.consume();
        } else {
          throw new Error("Expected quarter index (e.g., Q1, 1) inside []");
        }

        if (!this.match(TokenType.RBRACKET)) {
          throw new Error("Expected ]");
        }

        return this.getCellValue(token.value, quarterIndex);
      } else {
        // Identifier without brackets? Maybe a named constant or error?
        // For now, assume it's a metric for Q1 (Current Quarter) if no bracket
        // Or maybe throw error? Let's default to Q1 for backward compatibility if needed, 
        // but strict syntax is better.
        // Let's try to resolve it as Q1
        return this.getCellValue(token.value, 1);
      }
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
      // Logical Functions
      case 'IF':
        if (args.length < 2) throw new Error("IF requires at least 2 arguments");
        const ifResult = this.toBoolean(args[0]) ? args[1] : (args[2] ?? "No Signal");
        // Ensure IF never returns null - convert to "No Signal"
        return ifResult === null || ifResult === undefined ? "No Signal" : ifResult;
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
      case 'ISBLANK':
        if (args.length !== 1) throw new Error("ISBLANK requires 1 argument");
        return args[0] === null || args[0] === undefined || args[0] === '';

      // Math Functions
      case 'MIN':
        const numsMin = args.filter(a => typeof a === 'number') as number[];
        return numsMin.length > 0 ? Math.min(...numsMin) : null;
      case 'MAX':
        const numsMax = args.filter(a => typeof a === 'number') as number[];
        return numsMax.length > 0 ? Math.max(...numsMax) : null;
      case 'ABS':
        if (args.length !== 1) throw new Error("ABS requires 1 argument");
        return typeof args[0] === 'number' ? Math.abs(args[0]) : null;
      case 'SUM':
        const numsSum = args.filter(a => typeof a === 'number' && !isNaN(a)) as number[];
        return numsSum.length > 0 ? numsSum.reduce((a, b) => a + b, 0) : 0;
      case 'AVERAGE':
        const numsAvg = args.filter(a => typeof a === 'number' && !isNaN(a)) as number[];
        return numsAvg.length > 0 ? numsAvg.reduce((a, b) => a + b, 0) / numsAvg.length : null;
      case 'COUNT':
        return args.filter(a => a !== null && a !== undefined && (typeof a === 'number' || typeof a === 'string')).length;
      case 'ROUND':
        if (args.length !== 2) throw new Error("ROUND requires 2 arguments");
        if (typeof args[0] !== 'number' || typeof args[1] !== 'number') return null;
        return Math.round(args[0] * Math.pow(10, args[1])) / Math.pow(10, args[1]);
      case 'ROUNDUP':
        if (args.length !== 2) throw new Error("ROUNDUP requires 2 arguments");
        if (typeof args[0] !== 'number' || typeof args[1] !== 'number') return null;
        const factorUp = Math.pow(10, args[1]);
        return Math.ceil(args[0] * factorUp) / factorUp;
      case 'ROUNDDOWN':
        if (args.length !== 2) throw new Error("ROUNDDOWN requires 2 arguments");
        if (typeof args[0] !== 'number' || typeof args[1] !== 'number') return null;
        const factorDown = Math.pow(10, args[1]);
        return Math.floor(args[0] * factorDown) / factorDown;
      case 'SQRT':
        if (args.length !== 1) throw new Error("SQRT requires 1 argument");
        if (typeof args[0] !== 'number' || args[0] < 0) return null;
        return Math.sqrt(args[0]);
      case 'POWER':
        if (args.length !== 2) throw new Error("POWER requires 2 arguments");
        if (typeof args[0] !== 'number' || typeof args[1] !== 'number') return null;
        return Math.pow(args[0], args[1]);
      case 'LOG':
        if (args.length < 1 || args.length > 2) throw new Error("LOG requires 1 or 2 arguments");
        if (typeof args[0] !== 'number' || args[0] <= 0) return null;
        const base = args.length === 2 && typeof args[1] === 'number' ? args[1] : 10;
        if (base <= 0 || base === 1) return null;
        return Math.log(args[0]) / Math.log(base);
      case 'CEILING':
        if (args.length < 1 || args.length > 2) throw new Error("CEILING requires 1 or 2 arguments");
        if (typeof args[0] !== 'number') return null;
        const significance = args.length === 2 && typeof args[1] === 'number' && args[1] > 0 ? args[1] : 1;
        return Math.ceil(args[0] / significance) * significance;
      case 'FLOOR':
        if (args.length < 1 || args.length > 2) throw new Error("FLOOR requires 1 or 2 arguments");
        if (typeof args[0] !== 'number') return null;
        const floorSignificance = args.length === 2 && typeof args[1] === 'number' && args[1] > 0 ? args[1] : 1;
        return Math.floor(args[0] / floorSignificance) * floorSignificance;

      // Text Functions
      case 'TRIM':
        if (args.length !== 1) throw new Error("TRIM requires 1 argument");
        if (args[0] === null || args[0] === undefined) return '';
        return String(args[0]).trim();
      case 'CONCAT':
      case 'CONCATENATE':
        return args.map(a => a === null || a === undefined ? '' : String(a)).join('');

      // Error Handling Functions
      case 'IFERROR':
        if (args.length !== 2) throw new Error("IFERROR requires 2 arguments");
        const value = args[0];
        if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
          return args[1];
        }
        return value;
      case 'NOTNULL':
        if (args.length < 1) throw new Error("NOTNULL requires at least 1 argument");
        return args[0] !== null && args[0] !== undefined ? args[0] : (args[1] ?? null);
      case 'COALESCE':
        if (args.length === 0) throw new Error("COALESCE requires at least 1 argument");
        for (const arg of args) {
          if (arg !== null && arg !== undefined) return arg;
        }
        return null;

      // Conditional Aggregation Functions
      case 'SUMIF':
        if (args.length < 2 || args.length > 3) throw new Error("SUMIF requires 2 or 3 arguments");
        return this.evaluateSUMIF(args);
      case 'COUNTIF':
        if (args.length !== 2) throw new Error("COUNTIF requires 2 arguments");
        return this.evaluateCOUNTIF(args);

      default:
        console.warn(`Unknown function: ${name}`);
        return null;
    }
  }

  /**
   * Evaluate SUMIF function
   * SUMIF(range, criteria, sum_range?)
   * For quarterly metrics, range and sum_range are arrays of values
   */
  private evaluateSUMIF(args: FormulaResult[]): FormulaResult {
    const range = Array.isArray(args[0]) ? args[0] : [args[0]];
    const criteria = args[1];
    const sumRange = args.length === 3 
      ? (Array.isArray(args[2]) ? args[2] : [args[2]])
      : range; // Default to range if sum_range not provided

    if (typeof criteria !== 'string') {
      // If criteria is not a string, do exact match
      let sum = 0;
      for (let i = 0; i < Math.min(range.length, sumRange.length); i++) {
        if (this.matchesCriteria(range[i], criteria)) {
          const val = sumRange[i];
          if (typeof val === 'number' && !isNaN(val)) {
            sum += val;
          }
        }
      }
      return sum;
    }

    // Parse criteria string (e.g., ">10", "<5", "=value", "<>value")
    let sum = 0;
    for (let i = 0; i < Math.min(range.length, sumRange.length); i++) {
      if (this.matchesCriteria(range[i], criteria)) {
        const val = sumRange[i];
        if (typeof val === 'number' && !isNaN(val)) {
          sum += val;
        }
      }
    }
    return sum;
  }

  /**
   * Evaluate COUNTIF function
   * COUNTIF(range, criteria)
   */
  private evaluateCOUNTIF(args: FormulaResult[]): FormulaResult {
    const range = Array.isArray(args[0]) ? args[0] : [args[0]];
    const criteria = args[1];

    let count = 0;
    for (const value of range) {
      if (this.matchesCriteria(value, criteria)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if a value matches the given criteria
   * Supports: ">10", "<5", ">=10", "<=5", "=value", "<>value", "!=value", or exact match
   */
  private matchesCriteria(value: FormulaResult, criteria: FormulaResult): boolean {
    if (criteria === null || criteria === undefined) {
      return value === null || value === undefined;
    }

    if (typeof criteria === 'string') {
      const trimmed = criteria.trim();
      
      // Handle comparison operators
      if (trimmed.startsWith('>=')) {
        const num = parseFloat(trimmed.substring(2));
        if (!isNaN(num) && typeof value === 'number') {
          return value >= num;
        }
      } else if (trimmed.startsWith('<=')) {
        const num = parseFloat(trimmed.substring(2));
        if (!isNaN(num) && typeof value === 'number') {
          return value <= num;
        }
      } else if (trimmed.startsWith('<>') || trimmed.startsWith('!=')) {
        const num = parseFloat(trimmed.substring(2));
        if (!isNaN(num) && typeof value === 'number') {
          return value !== num;
        }
        return value !== trimmed.substring(2);
      } else if (trimmed.startsWith('>')) {
        const num = parseFloat(trimmed.substring(1));
        if (!isNaN(num) && typeof value === 'number') {
          return value > num;
        }
      } else if (trimmed.startsWith('<')) {
        const num = parseFloat(trimmed.substring(1));
        if (!isNaN(num) && typeof value === 'number') {
          return value < num;
        }
      } else if (trimmed.startsWith('=')) {
        const num = parseFloat(trimmed.substring(1));
        if (!isNaN(num) && typeof value === 'number') {
          const epsilon = 0.0000001;
          return Math.abs(value - num) < epsilon;
        }
        return value === trimmed.substring(1);
      }
      
      // Exact match (string comparison)
      return value === trimmed || String(value) === trimmed;
    }

    // Direct comparison
    if (typeof criteria === 'number' && typeof value === 'number') {
      const epsilon = 0.0000001;
      return Math.abs(value - criteria) < epsilon;
    }

    return value === criteria;
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

  private getCellValue(metricName: string, quarterIndex: number): number | null {
    // quarterIndex: 1 = Oldest in selected window, 12 = Newest in selected window
    // sortedQuarters is sorted Newest -> Oldest (Index 0 = Newest)
    // So Q12 -> Index 0
    // Q1 -> Index 11 (if length is 12)
    // General formula: arrayIndex = sortedQuarters.length - quarterIndex
    const arrayIndex = this.sortedQuarters.length - quarterIndex;

    if (arrayIndex < 0 || arrayIndex >= this.sortedQuarters.length) {
      return null;
    }

    const quarterName = this.sortedQuarters[arrayIndex];
    const quarterMetrics = this.dataMap.get(quarterName);

    if (!quarterMetrics) return null;

    // Try exact match
    if (quarterMetrics.has(metricName)) {
      return quarterMetrics.get(metricName) ?? null;
    }

    // Try normalized match
    const normalized = normalizeKey(metricName);
    if (quarterMetrics.has(normalized)) {
      return quarterMetrics.get(normalized) ?? null;
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

    // Filter quarters if selectedQuarters provided
    let quartersToUse = quarterlyData;
    if (selectedQuarters && selectedQuarters.length > 0) {
      const selectedSet = new Set(selectedQuarters);
      quartersToUse = quarterlyData.filter(q => selectedSet.has(q.quarter));
    }

    // Create evaluator with filtered data
    const evaluator = new ExcelFormulaEvaluator(quartersToUse, selectedQuarters);
    let result = evaluator.evaluate(formula);

    // Convert null to "No Signal" to ensure we always return a meaningful result
    if (result === null || result === undefined) {
      result = "No Signal";
    }

    let resultType = "string";
    if (typeof result === "boolean") resultType = "boolean";
    else if (typeof result === "number") resultType = "number";

    return { result, resultType, usedQuarters: evaluator.sortedQuarters.slice(0, 5) };
  } catch (error) {
    console.error(`Error evaluating Excel formula for ${ticker}:`, error);
    return { result: null, resultType: "null", usedQuarters: [] };
  }
}
