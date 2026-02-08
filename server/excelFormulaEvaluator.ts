/**
 * Excel Formula Evaluator for Quarterly Metrics
 * Supports Excel-style formulas with IF, AND, OR, NOT, ISNUMBER, MIN, MAX, ABS, etc.
 * Supports arithmetic operations (+, -, *, /) and nested expressions.
 * Supports dynamic metric referencing using MetricName[Qn] syntax.
 * Q12 = newest quarter, Q11 = second newest, ..., Q1 = oldest (in 12-quarter window).
 * Normalizes percentage values to decimals (e.g. 20% -> 0.2).
 *
 * Supported Functions:
 * - Logical: IF, AND, OR, NOT, ISNUMBER, ISBLANK
 * - Math: MIN, MAX, ABS, SUM, AVERAGE, COUNT, ROUND, ROUNDUP, ROUNDDOWN, SQRT, POWER, LOG, CEILING, FLOOR
 * - Text: TRIM, CONCAT, CONCATENATE
 * - Error Handling: IFERROR, NOTNULL, COALESCE
 * - Conditional: SUMIF, COUNTIF
 * - Array / Excel 365-style: LET, CHOOSE, SEQUENCE, MAP, LAMBDA, INDEX, XLOOKUP
 * - Array literal: { expr, expr, ... }
 */

import type { QuarterlyData } from "@shared/schema";
import { storage } from "./storage";

// Scalar, array, or lambda (internal) result
export type FormulaResult = string | number | boolean | null | FormulaResult[] | LambdaValue;
export interface LambdaValue {
  __lambda: true;
  paramName: string;
  bodyStartTokenIndex: number;
  bodyEndTokenIndex: number;
}

// Map of Quarter Name -> Metric Name -> Value
type QuarterlyDataMap = Map<string, Map<string, number | null>>;

// Trace data structures for formula evaluation debugging
export interface EvaluationStep {
  type: 'metric_lookup' | 'function_call' | 'comparison' | 'arithmetic' | 'logical' | 'unary';
  description: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface MetricSubstitution {
  original: string; // e.g., "OPM[Q12]"
  metricName: string; // e.g., "OPM"
  quarter: string; // e.g., "2024-03-31"
  quarterIndex: number; // e.g., 12 (Q12)
  value: number | null;
  normalized: boolean;
}

export interface FormulaTrace {
  originalFormula: string;
  formulaWithSubstitutions: string;
  substitutions: MetricSubstitution[];
  steps: EvaluationStep[];
  result: FormulaResult;
  usedQuarters: string[];
  evaluationTime: number;
}

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
  LBRACE,   // {
  RBRACE,   // }
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
  private selectedQuarters?: string[]; // Store selected quarters for trace
  private tokens: Token[] = [];
  private currentTokenIndex = 0;
  private verboseLogging: boolean;
  private collectTrace: boolean;
  private traceSteps: EvaluationStep[] = [];
  private metricSubstitutions: Map<string, MetricSubstitution> = new Map();
  private originalFormula: string = '';
  /** Scope stack for LET bindings and LAMBDA parameter. Top map has current bindings. */
  private scopeStack: Map<string, FormulaResult>[] = [];

  constructor(quarterlyData: QuarterlyData[], selectedQuarters?: string[], verboseLogging: boolean = false, collectTrace: boolean = false) {
    const extracted = extractQuarterlyMetrics(quarterlyData, selectedQuarters);
    this.dataMap = extracted.dataMap;
    this.sortedQuarters = extracted.sortedQuarters;
    this.selectedQuarters = selectedQuarters; // Store for trace
    this.verboseLogging = verboseLogging || process.env.EXCEL_FORMULA_VERBOSE_LOGGING === 'true';
    this.collectTrace = collectTrace;
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

      this.originalFormula = formula;
      if (this.collectTrace) {
        this.traceSteps = [];
        this.metricSubstitutions.clear();
      }

      const startTime = Date.now();
      this.tokenize(formula);
      const result = this.parseExpression();
      const evaluationTime = Date.now() - startTime;

      if (this.currentTokenIndex < this.tokens.length && this.tokens[this.currentTokenIndex].type !== TokenType.EOF) {
        console.warn("Formula has trailing tokens");
      }

      const finalResult = result === null || result === undefined ? "No Signal" : result;

      if (this.collectTrace) {
        this.addTraceStep('logical', 'Formula evaluation completed', { formula }, { result: finalResult, evaluationTime });
      }

      return finalResult;
    } catch (error: any) {
      console.error(`Error evaluating formula: ${error.message}`);
      if (this.collectTrace) {
        this.addTraceStep('logical', `Error: ${error.message}`, { formula }, { result: "No Signal" });
      }
      return "No Signal";
    }
  }

  /**
   * Add a trace step
   */
  private addTraceStep(
    type: EvaluationStep['type'],
    description: string,
    input?: any,
    output?: any,
    metadata?: Record<string, any>
  ): void {
    if (!this.collectTrace) return;
    this.traceSteps.push({
      type,
      description,
      input,
      output,
      metadata,
      timestamp: Date.now(),
    });
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
      } else if (char === '{') {
        this.tokens.push({ type: TokenType.LBRACE, value: '{', position: i });
        i++;
      } else if (char === '}') {
        this.tokens.push({ type: TokenType.RBRACE, value: '}', position: i });
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
          'SUMIF', 'COUNTIF',
          'LET', 'CHOOSE', 'SEQUENCE', 'MAP', 'LAMBDA', 'INDEX', 'XLOOKUP'
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

    // Array literal { expr, expr, ... }
    if (token.type === TokenType.LBRACE) {
      return this.parseArrayLiteral();
    }

    if (token.type === TokenType.IDENTIFIER) {
      const identValue = token.value;
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

        return this.getCellValue(identValue, quarterIndex);
      } else {
        // No bracket: check LET/LAMBDA scope first, else treat as metric for Q1
        if (this.scopeStack.length > 0) {
          const top = this.scopeStack[this.scopeStack.length - 1];
          if (top.has(identValue)) {
            return top.get(identValue)!;
          }
        }
        return this.getCellValue(identValue, 1);
      }
    }

    if (token.type === TokenType.FUNCTION) {
      const funcName = token.value;
      this.consume();
      if (funcName === 'LET') return this.parseLet();
      if (funcName === 'LAMBDA') return this.parseLambda();
      return this.parseFunctionCall(funcName);
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

  /** Parse array literal { expr, expr, ... } */
  private parseArrayLiteral(): FormulaResult {
    if (!this.match(TokenType.LBRACE)) throw new Error("Expected {");
    const arr: FormulaResult[] = [];
    if (this.peek().type !== TokenType.RBRACE) {
      do {
        arr.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }
    if (!this.match(TokenType.RBRACE)) throw new Error("Expected }");
    return arr;
  }

  /** Parse LET(name1, value1, name2, value2, ..., body). Pushes scope, evaluates body, pops. */
  private parseLet(): FormulaResult {
    if (!this.match(TokenType.LPAREN)) throw new Error("Expected ( after LET");
    this.scopeStack.push(new Map());
    try {
      while (this.peek().type === TokenType.IDENTIFIER) {
        const savedIndex = this.currentTokenIndex;
        const name = this.consume().value;
        if (!this.match(TokenType.COMMA)) {
          // Not a (name, value) pair — identifier is start of body; rewind and parse body
          this.currentTokenIndex = savedIndex;
          break;
        }
        const value = this.parseExpression();
        this.scopeStack[this.scopeStack.length - 1].set(name, value);
        if (this.peek().type === TokenType.RPAREN) break;
        if (!this.match(TokenType.COMMA)) break;
      }
      const body = this.parseExpression();
      if (!this.match(TokenType.RPAREN)) throw new Error("Expected ) to close LET");
      return body;
    } finally {
      this.scopeStack.pop();
    }
  }

  /** Parse LAMBDA(param, body). Returns LambdaValue (body is re-parsed when lambda is invoked). */
  private parseLambda(): FormulaResult {
    if (!this.match(TokenType.LPAREN)) throw new Error("Expected ( after LAMBDA");
    if (this.peek().type !== TokenType.IDENTIFIER) throw new Error("LAMBDA requires parameter name");
    const paramName = this.consume().value;
    if (!this.match(TokenType.COMMA)) throw new Error("Expected comma in LAMBDA");
    const bodyStartTokenIndex = this.currentTokenIndex;
    this.parseExpression(); // consume body (do not use result)
    const bodyEndTokenIndex = this.currentTokenIndex;
    if (!this.match(TokenType.RPAREN)) throw new Error("Expected ) to close LAMBDA");
    return { __lambda: true, paramName, bodyStartTokenIndex, bodyEndTokenIndex };
  }

  /** Evaluate a lambda with one argument. Saves/restores token index and pushes/pops scope. */
  private evaluateLambda(lambda: LambdaValue, arg: FormulaResult): FormulaResult {
    const savedIndex = this.currentTokenIndex;
    this.scopeStack.push(new Map([[lambda.paramName, arg]]));
    try {
      this.currentTokenIndex = lambda.bodyStartTokenIndex;
      return this.parseExpression();
    } finally {
      this.scopeStack.pop();
      this.currentTokenIndex = savedIndex;
    }
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
    const functionStartTime = Date.now();
    let result: FormulaResult;

    switch (name) {
      // Logical Functions
      case 'IF':
        if (args.length < 2) throw new Error("IF requires at least 2 arguments");
        const condition = this.toBoolean(args[0]);
        result = condition ? args[1] : (args[2] ?? "No Signal");
        // Ensure IF never returns null - convert to "No Signal"
        result = result === null || result === undefined ? "No Signal" : result;
        if (this.collectTrace) {
          this.addTraceStep('function_call', `IF(${args[0]}, ${args[1]}, ${args[2] ?? "No Signal"})`, { function: 'IF', condition, trueValue: args[1], falseValue: args[2] }, { result }, { evaluationTime: Date.now() - functionStartTime });
        }
        return result;
      case 'AND':
        result = args.every(arg => this.toBoolean(arg));
        if (this.collectTrace) {
          this.addTraceStep('function_call', `AND(${args.map(a => String(a)).join(', ')})`, { function: 'AND', arguments: args }, { result });
        }
        return result;
      case 'OR':
        result = args.some(arg => this.toBoolean(arg));
        if (this.collectTrace) {
          this.addTraceStep('function_call', `OR(${args.map(a => String(a)).join(', ')})`, { function: 'OR', arguments: args }, { result });
        }
        return result;
      case 'NOT':
        if (args.length !== 1) throw new Error("NOT requires 1 argument");
        result = !this.toBoolean(args[0]);
        if (this.collectTrace) {
          this.addTraceStep('function_call', `NOT(${args[0]})`, { function: 'NOT', argument: args[0] }, { result });
        }
        return result;
      case 'ISNUMBER':
        if (args.length !== 1) throw new Error("ISNUMBER requires 1 argument");
        return typeof args[0] === 'number' && !isNaN(args[0]);
      case 'ISBLANK':
        if (args.length !== 1) throw new Error("ISBLANK requires 1 argument");
        return args[0] === null || args[0] === undefined || args[0] === '';

      // Math Functions
      case 'MIN':
        const numsMin = args.filter(a => typeof a === 'number') as number[];
        result = numsMin.length > 0 ? Math.min(...numsMin) : null;
        if (this.collectTrace) {
          this.addTraceStep('function_call', `MIN(${args.map(a => String(a)).join(', ')})`, { function: 'MIN', arguments: args, numericArgs: numsMin }, { result });
        }
        return result;
      case 'MAX':
        const numsMax = args.filter(a => typeof a === 'number') as number[];
        result = numsMax.length > 0 ? Math.max(...numsMax) : null;
        if (this.collectTrace) {
          this.addTraceStep('function_call', `MAX(${args.map(a => String(a)).join(', ')})`, { function: 'MAX', arguments: args, numericArgs: numsMax }, { result });
        }
        return result;
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

      // Array / Excel 365-style functions
      case 'CHOOSE': {
        if (args.length < 2) throw new Error("CHOOSE requires at least 2 arguments");
        const indexArg = args[0];
        if (Array.isArray(indexArg)) {
          // CHOOSE({1,2,3,...}, v1, v2, v3, ...) -> [v1, v2, v3, ...]
          return indexArg.map((_, i) => args[i + 1] ?? null);
        }
        const idx = typeof indexArg === 'number' ? Math.round(indexArg) : 0;
        return args[idx] ?? null;
      }
      case 'SEQUENCE': {
        const rows = Math.max(0, Math.floor(Number(args[0]) || 0));
        const cols = args.length >= 2 ? Math.max(0, Math.floor(Number(args[1]) || 0)) : 1;
        const start = args.length >= 3 ? Number(args[2]) || 1 : 1;
        const step = args.length >= 4 ? Number(args[3]) || 1 : 1;
        const arr: FormulaResult[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            arr.push(start + (r * cols + c) * step);
          }
        }
        return cols === 1 ? arr : arr; // return 1D array (rows*cols)
      }
      case 'MAP': {
        if (args.length !== 2) throw new Error("MAP requires 2 arguments (array, lambda)");
        const arr = Array.isArray(args[0]) ? args[0] : [args[0]];
        const lambda = args[1];
        if (typeof lambda !== 'object' || !lambda || !('__lambda' in lambda)) {
          throw new Error("MAP second argument must be a LAMBDA");
        }
        const out: FormulaResult[] = [];
        for (let i = 0; i < arr.length; i++) {
          out.push(this.evaluateLambda(lambda as LambdaValue, arr[i]));
        }
        return out;
      }
      case 'INDEX': {
        if (args.length < 2) throw new Error("INDEX requires at least 2 arguments");
        const arr = Array.isArray(args[0]) ? args[0] : null;
        if (arr === null) return null;
        const row = typeof args[1] === 'number' ? Math.round(args[1]) : 0;
        const oneBased = Math.max(1, row);
        const idx = oneBased - 1;
        if (idx < 0 || idx >= arr.length) return null;
        return arr[idx];
      }
      case 'XLOOKUP': {
        if (args.length < 3) throw new Error("XLOOKUP requires at least 3 arguments");
        const lookupValue = args[0];
        const lookupArray = Array.isArray(args[1]) ? args[1] : [args[1]];
        const returnArray = Array.isArray(args[2]) ? args[2] : [args[2]];
        const ifNotFound = args.length >= 4 ? args[3] : null;
        const searchMode = args.length >= 6 ? Number(args[5]) : 0;
        let foundIndex = -1;
        if (searchMode === -1) {
          for (let i = lookupArray.length - 1; i >= 0; i--) {
            if (this.xlookupMatch(lookupValue, lookupArray[i])) {
              foundIndex = i;
              break;
            }
          }
        } else {
          for (let i = 0; i < lookupArray.length; i++) {
            if (this.xlookupMatch(lookupValue, lookupArray[i])) {
              foundIndex = i;
              break;
            }
          }
        }
        if (foundIndex < 0) return ifNotFound;
        return returnArray[foundIndex] ?? ifNotFound;
      }

      default:
        console.warn(`Unknown function: ${name}`);
        return null;
    }
  }

  private xlookupMatch(a: FormulaResult, b: FormulaResult): boolean {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-10;
    return a === b;
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
    if (typeof left !== 'number' || typeof right !== 'number') {
      if (this.collectTrace) {
        this.addTraceStep('arithmetic', `Arithmetic operation failed: ${op}`, { left, right, op }, { result: null }, { error: 'Non-numeric operands' });
      }
      return null;
    }

    let result: number | null;
    switch (op) {
      case '+': result = left + right; break;
      case '-': result = left - right; break;
      case '*': result = left * right; break;
      case '/': result = right !== 0 ? left / right : null; break;
      default: result = null;
    }

    if (this.collectTrace) {
      this.addTraceStep('arithmetic', `${left} ${op} ${right}`, { left, right, op }, { result });
    }

    return result;
  }

  private evaluateComparison(left: FormulaResult, op: string, right: FormulaResult): boolean {
    let result: boolean;

    if (left === null || right === null) {
      result = false;
      if (this.collectTrace) {
        this.addTraceStep('comparison', `Comparison failed: null value`, { left, right, op }, { result: false }, { error: 'Null operand' });
      }
      return result;
    }

    if (typeof left === 'number' && typeof right === 'number') {
      // Float precision check
      const diff = left - right;
      const epsilon = 0.0000001;

      switch (op) {
        case '>': result = left > right; break;
        case '<': result = left < right; break;
        case '>=': result = left >= right - epsilon; break;
        case '<=': result = left <= right + epsilon; break;
        case '=': result = Math.abs(diff) < epsilon; break;
        case '<>':
        case '!=': result = Math.abs(diff) >= epsilon; break;
        default: result = false;
      }
    } else {
      // String/Bool comparison
      switch (op) {
        case '=': result = left === right; break;
        case '<>':
        case '!=': result = left !== right; break;
        default: result = false; // Invalid for non-numbers
      }
    }

    if (this.collectTrace) {
      this.addTraceStep('comparison', `${left} ${op} ${right}`, { left, right, op }, { result });
    }

    return result;
  }

  private getCellValue(metricName: string, quarterIndex: number): number | null {
    // Q12 = latest quarter, Q11 = second latest, ..., Q1 = 12th-from-latest (oldest in a full 12-quarter window).
    // sortedQuarters is sorted Newest -> Oldest (index 0 = Newest).
    // Map by position from newest: Q12 -> index 0, Q11 -> index 1, ..., Q1 -> index 11.
    // This works for companies with fewer than 12 quarters (e.g. 7 quarters: Q12=latest, Q11=2nd latest, ..., Q6=7th; Q5..Q1 out of range).
    const arrayIndex = 12 - quarterIndex;
    const metricRef = `${metricName}[Q${quarterIndex}]`;
    let normalized = false;
    let value: number | null = null;
    let quarterName: string | undefined;

    if (arrayIndex < 0 || arrayIndex >= this.sortedQuarters.length) {
      if (this.verboseLogging) {
        console.log(`[EXCEL-FORMULA] ⚠️  ${metricName}[Q${quarterIndex}]: arrayIndex ${arrayIndex} out of range (0-${this.sortedQuarters.length - 1}), returning null`);
      }
      quarterName = undefined;
      value = null;
    } else {
      quarterName = this.sortedQuarters[arrayIndex];
      const quarterMetrics = this.dataMap.get(quarterName);

      if (!quarterMetrics) {
        if (this.verboseLogging) {
          console.log(`[EXCEL-FORMULA] ⚠️  ${metricName}[Q${quarterIndex}]: No metrics found for quarter ${quarterName}, returning null`);
        }
        value = null;
      } else {
        // Helper function to try finding a metric
        const tryFindMetric = (name: string): number | null => {
          // Try exact match
          if (quarterMetrics.has(name)) {
            return quarterMetrics.get(name) ?? null;
          }
          // Try normalized match
          const normalizedKey = normalizeKey(name);
          if (quarterMetrics.has(normalizedKey)) {
            return quarterMetrics.get(normalizedKey) ?? null;
          }
          return null;
        };

        // Try to find the requested metric
        value = tryFindMetric(metricName);

        // If OPM % is not available, fallback to Financing Margin % (for any sector)
        // This ensures companies without OPM can still use Financing Margin as a substitute
        if (value === null) {
          const normalizedMetricName = normalizeKey(metricName);
          const isOPM = normalizedMetricName.includes('opm') || 
                       normalizedMetricName.includes('operatingprofitmargin') ||
                       normalizedMetricName.includes('operatingmargin');
          
          if (isOPM) {
            // Try Financing Margin % as fallback (works for all sectors, not just banking)
            const financingMarginVariations = [
              'Financing Margin %',
              'Financing Margin',
              'financingmargin',
              'financing_margin'
            ];
            
            for (const fmName of financingMarginVariations) {
              const fmValue = tryFindMetric(fmName);
              if (fmValue !== null) {
                value = fmValue;
                normalized = true;
                if (this.verboseLogging) {
                  console.log(`[EXCEL-FORMULA] ✓ ${metricName}[Q${quarterIndex}] (${quarterName}): OPM not found, using Financing Margin %: ${value}`);
                }
                break;
              }
            }
          }
        }

        // Log result
        if (value !== null) {
          if (!normalized && this.verboseLogging) {
            console.log(`[EXCEL-FORMULA] ✓ ${metricName}[Q${quarterIndex}] (${quarterName}): ${value}`);
          }
        } else {
          if (this.verboseLogging) {
            console.log(`[EXCEL-FORMULA] ⚠️  ${metricName}[Q${quarterIndex}] (${quarterName}): Metric not found, returning null`);
            console.log(`[EXCEL-FORMULA] Available metrics in ${quarterName}: ${Array.from(quarterMetrics.keys()).slice(0, 10).join(', ')}${quarterMetrics.size > 10 ? ` (${quarterMetrics.size} total)` : ''}`);
          }
        }
      }
    }

    // Record substitution for trace
    if (this.collectTrace && quarterName) {
      this.metricSubstitutions.set(metricRef, {
        original: metricRef,
        metricName,
        quarter: quarterName,
        quarterIndex,
        value,
        normalized,
      });
      this.addTraceStep(
        'metric_lookup',
        `Lookup ${metricRef}`,
        { metricName, quarterIndex, quarter: quarterName },
        { value, normalized },
        { found: value !== null }
      );
    }

    return value;
  }

  private toBoolean(value: FormulaResult): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0 && !isNaN(value);
    if (typeof value === 'string') return value.toLowerCase() !== 'false' && value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object' && value !== null && '__lambda' in value) return true;
    return false;
  }

  /**
   * Get the trace of the evaluation
   */
  getTrace(): FormulaTrace {
    const startTime = this.traceSteps.length > 0 ? this.traceSteps[0].timestamp : Date.now();
    const endTime = this.traceSteps.length > 0 ? this.traceSteps[this.traceSteps.length - 1].timestamp : Date.now();
    const evaluationTime = endTime - startTime;

    // Get the final result from the last step if available, otherwise use "No Signal"
    let finalResult: FormulaResult = "No Signal";
    if (this.traceSteps.length > 0) {
      const lastStep = this.traceSteps[this.traceSteps.length - 1];
      if (lastStep.output?.result !== undefined) {
        finalResult = lastStep.output.result;
      }
    }

    // Extract unique quarters that were actually used in the formula from metric substitutions
    const substitutions = Array.from(this.metricSubstitutions.values());
    const actuallyUsedQuarters = new Set<string>();
    substitutions.forEach(sub => {
      if (sub.quarter) {
        actuallyUsedQuarters.add(sub.quarter);
      }
    });
    
    // Sort the actually used quarters (newest first, matching the evaluation order)
    const sortedActuallyUsedQuarters = Array.from(actuallyUsedQuarters).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime(); // Descending (Newest first)
      }
      return b.localeCompare(a);
    });

    // Use actually used quarters if we have substitutions, otherwise fall back to selectedQuarters or all sortedQuarters
    const usedQuartersForTrace = sortedActuallyUsedQuarters.length > 0
      ? sortedActuallyUsedQuarters
      : (this.selectedQuarters && this.selectedQuarters.length > 0
          ? this.selectedQuarters
          : this.sortedQuarters);

    return {
      originalFormula: this.originalFormula,
      formulaWithSubstitutions: this.getFormulaWithSubstitutions(),
      substitutions: substitutions,
      steps: this.traceSteps,
      result: finalResult,
      usedQuarters: usedQuartersForTrace,
      evaluationTime,
    };
  }

  /**
   * Get formula with metric values substituted
   */
  getFormulaWithSubstitutions(): string {
    let substituted = this.originalFormula;
    
    // Replace metric references with their values in reverse order of length to avoid partial matches
    const substitutions = Array.from(this.metricSubstitutions.entries()).sort((a, b) => b[0].length - a[0].length);
    
    for (const [metricRef, sub] of substitutions) {
      // Escape special regex characters in the metric reference
      const escaped = metricRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'g');
      const valueStr = sub.value !== null ? String(sub.value) : 'null';
      substituted = substituted.replace(pattern, valueStr);
    }

    return substituted;
  }
}

/**
 * Evaluate Excel formula for a company by ticker
 */
export async function evaluateExcelFormulaForCompany(
  ticker: string,
  formula: string,
  selectedQuarters?: string[],
  verboseLogging: boolean = false,
  collectTrace: boolean = false
): Promise<{ result: FormulaResult; resultType: string; usedQuarters: string[]; trace?: FormulaTrace }> {
  const isVerbose = verboseLogging || process.env.EXCEL_FORMULA_VERBOSE_LOGGING === 'true';
  
  console.log(`[EXCEL-FORMULA] Evaluating formula for ticker: ${ticker}`);
  console.log(`[EXCEL-FORMULA] Formula: ${formula.substring(0, 200)}${formula.length > 200 ? '...' : ''}`);
  try {
    const quarterlyData = await storage.getQuarterlyDataByTicker(ticker);
    console.log(`[EXCEL-FORMULA] Retrieved ${quarterlyData?.length || 0} quarterly data records for ticker ${ticker}`);

    if (!quarterlyData || quarterlyData.length === 0) {
      console.log(`[EXCEL-FORMULA] No quarterly data found for ticker ${ticker}, returning "No Signal"`);
      const emptyTrace: FormulaTrace = {
        originalFormula: formula,
        formulaWithSubstitutions: formula,
        substitutions: [],
        steps: [],
        result: "No Signal",
        usedQuarters: [],
        evaluationTime: 0,
      };
      return collectTrace 
        ? { result: "No Signal", resultType: "string", usedQuarters: [], trace: emptyTrace }
        : { result: "No Signal", resultType: "string", usedQuarters: [] };
    }

    // Log available quarters
    const uniqueQuarters = Array.from(new Set(quarterlyData.map(d => d.quarter)));
    console.log(`[EXCEL-FORMULA] Available quarters: ${uniqueQuarters.join(', ')}`);
    
    // Log available metrics
    const uniqueMetrics = Array.from(new Set(quarterlyData.map(d => d.metricName)));
    console.log(`[EXCEL-FORMULA] Available metrics: ${uniqueMetrics.slice(0, 10).join(', ')}${uniqueMetrics.length > 10 ? ` (${uniqueMetrics.length} total)` : ''}`);

    // Filter quarters if selectedQuarters provided
    let quartersToUse = quarterlyData;
    if (selectedQuarters && selectedQuarters.length > 0) {
      const selectedSet = new Set(selectedQuarters);
      quartersToUse = quarterlyData.filter(q => selectedSet.has(q.quarter));
    }

    // Create evaluator with filtered data
    console.log(`[EXCEL-FORMULA] Creating evaluator with ${quartersToUse.length} quarters${selectedQuarters ? ` (filtered from ${selectedQuarters.length} selected)` : ''}`);
    const evaluator = new ExcelFormulaEvaluator(quartersToUse, selectedQuarters, isVerbose, collectTrace);
    console.log(`[EXCEL-FORMULA] Evaluator sorted quarters (Q1=oldest, Q${evaluator.sortedQuarters.length}=newest): ${evaluator.sortedQuarters.slice(0, 5).join(', ')}${evaluator.sortedQuarters.length > 5 ? '...' : ''}`);
    console.log(`[EXCEL-FORMULA] Quarter mapping: Q${evaluator.sortedQuarters.length} = ${evaluator.sortedQuarters[0]} (newest), Q1 = ${evaluator.sortedQuarters[evaluator.sortedQuarters.length - 1]} (oldest)`);
    if (isVerbose) {
      console.log(`[EXCEL-FORMULA] Starting formula evaluation with verbose logging...`);
    }
    
    let result = evaluator.evaluate(formula);
    console.log(`[EXCEL-FORMULA] Formula evaluation result: ${JSON.stringify(result)} (type: ${typeof result})`);

    // Convert null to "No Signal" to ensure we always return a meaningful result
    if (result === null || result === undefined) {
      console.log(`[EXCEL-FORMULA] Result is null/undefined, converting to "No Signal"`);
      result = "No Signal";
    }

    let resultType = "string";
    if (typeof result === "boolean") resultType = "boolean";
    else if (typeof result === "number") resultType = "number";

    // Return only the quarters that were actually used (selectedQuarters if provided, otherwise all sorted quarters)
    // For Excel formulas using Q12/Q11, selectedQuarters will contain only the last 2 quarters
    const usedQuartersResult = selectedQuarters && selectedQuarters.length > 0 
      ? selectedQuarters 
      : evaluator.sortedQuarters;
    console.log(`[EXCEL-FORMULA] Final result: ${JSON.stringify(result)} (${resultType}), used quarters: ${usedQuartersResult.join(', ')}`);
    
    const returnValue: { result: FormulaResult; resultType: string; usedQuarters: string[]; trace?: FormulaTrace } = {
      result,
      resultType,
      usedQuarters: usedQuartersResult,
    };

    if (collectTrace) {
      const trace = evaluator.getTrace();
      trace.result = result; // Ensure trace has the final result
      returnValue.trace = trace;
    }

    return returnValue;
  } catch (error) {
    console.error(`[EXCEL-FORMULA] ✗ Error evaluating Excel formula for ${ticker}:`, error);
    if (error instanceof Error) {
      console.error(`[EXCEL-FORMULA] Error message: ${error.message}`);
      console.error(`[EXCEL-FORMULA] Error stack: ${error.stack}`);
    }
    return { result: "No Signal", resultType: "string", usedQuarters: [] };
  }
}
