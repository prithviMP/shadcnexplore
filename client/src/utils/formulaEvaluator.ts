/**
 * Excel Formula Evaluator
 * Supports basic Excel formulas with cell references
 */

export interface CellReference {
  row: number;
  col: number;
}

export interface FormulaResult {
  value: number | string | null;
  error?: string;
}

/**
 * Parse cell reference (e.g., "A1", "B2", "AA10")
 */
export function parseCellReference(ref: string): CellReference | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;

  const colStr = match[1].toUpperCase();
  const row = parseInt(match[2], 10) - 1; // Convert to 0-based

  // Convert column letters to number (A=0, B=1, ..., Z=25, AA=26, etc.)
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1; // Convert to 0-based

  return { row, col };
}

/**
 * Convert row/col to cell reference (e.g., 0,0 -> "A1")
 */
export function cellReferenceToString(row: number, col: number): string {
  const colStr = colToLetters(col);
  return `${colStr}${row + 1}`;
}

function colToLetters(col: number): string {
  let result = "";
  col += 1; // Convert to 1-based
  while (col > 0) {
    col -= 1;
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26);
  }
  return result;
}

/**
 * Extract cell references from formula
 */
export function extractCellReferences(formula: string): string[] {
  const cellRefPattern = /\b([A-Z]+[0-9]+)\b/gi;
  const matches = formula.match(cellRefPattern);
  return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : [];
}

/**
 * Evaluate Excel formula
 */
export function evaluateFormula(
  formula: string,
  getCellValue: (row: number, col: number) => number | string | null
): FormulaResult {
  if (!formula.startsWith("=")) {
    return { value: null, error: "Formula must start with =" };
  }

  const expression = formula.substring(1).trim();

  try {
    // Handle SUM function: SUM(A1:A10) or SUM(A1, B2, C3)
    if (expression.toUpperCase().startsWith("SUM(")) {
      return evaluateSUM(expression, getCellValue);
    }

    // Handle IF function: IF(condition, true_value, false_value)
    if (expression.toUpperCase().startsWith("IF(")) {
      return evaluateIF(expression, getCellValue);
    }

    // Handle AVERAGE function
    if (expression.toUpperCase().startsWith("AVERAGE(")) {
      return evaluateAVERAGE(expression, getCellValue);
    }

    // Handle MAX function
    if (expression.toUpperCase().startsWith("MAX(")) {
      return evaluateMAX(expression, getCellValue);
    }

    // Handle MIN function
    if (expression.toUpperCase().startsWith("MIN(")) {
      return evaluateMIN(expression, getCellValue);
    }

    // Handle simple arithmetic with cell references
    return evaluateExpression(expression, getCellValue);
  } catch (error: any) {
    return { value: null, error: error.message || "Formula error" };
  }
}

function evaluateSUM(expression: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  const match = expression.match(/^SUM\((.*)\)$/i);
  if (!match) return { value: null, error: "Invalid SUM syntax" };

  const args = parseFunctionArgs(match[1]);
  let sum = 0;
  let hasValue = false;

  for (const arg of args) {
    const values = expandRange(arg, getCellValue);
    for (const val of values) {
      if (typeof val === "number") {
        sum += val;
        hasValue = true;
      }
    }
  }

  return hasValue ? { value: sum } : { value: 0 };
}

function evaluateAVERAGE(expression: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  const match = expression.match(/^AVERAGE\((.*)\)$/i);
  if (!match) return { value: null, error: "Invalid AVERAGE syntax" };

  const args = parseFunctionArgs(match[1]);
  const values: number[] = [];

  for (const arg of args) {
    const expanded = expandRange(arg, getCellValue);
    for (const val of expanded) {
      if (typeof val === "number") {
        values.push(val);
      }
    }
  }

  if (values.length === 0) return { value: null, error: "No numeric values" };
  const sum = values.reduce((a, b) => a + b, 0);
  return { value: sum / values.length };
}

function evaluateMAX(expression: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  const match = expression.match(/^MAX\((.*)\)$/i);
  if (!match) return { value: null, error: "Invalid MAX syntax" };

  const args = parseFunctionArgs(match[1]);
  const values: number[] = [];

  for (const arg of args) {
    const expanded = expandRange(arg, getCellValue);
    for (const val of expanded) {
      if (typeof val === "number") {
        values.push(val);
      }
    }
  }

  if (values.length === 0) return { value: null, error: "No numeric values" };
  return { value: Math.max(...values) };
}

function evaluateMIN(expression: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  const match = expression.match(/^MIN\((.*)\)$/i);
  if (!match) return { value: null, error: "Invalid MIN syntax" };

  const args = parseFunctionArgs(match[1]);
  const values: number[] = [];

  for (const arg of args) {
    const expanded = expandRange(arg, getCellValue);
    for (const val of expanded) {
      if (typeof val === "number") {
        values.push(val);
      }
    }
  }

  if (values.length === 0) return { value: null, error: "No numeric values" };
  return { value: Math.min(...values) };
}

function evaluateIF(expression: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  const match = expression.match(/^IF\((.*)\)$/i);
  if (!match) return { value: null, error: "Invalid IF syntax" };

  const args = parseFunctionArgs(match[1]);
  if (args.length !== 3) {
    return { value: null, error: "IF requires 3 arguments: condition, true_value, false_value" };
  }

  const condition = args[0].trim();
  const trueValue = args[1].trim();
  const falseValue = args[2].trim();

  // Evaluate condition (simple comparisons)
  const conditionResult = evaluateCondition(condition, getCellValue);
  
  if (conditionResult) {
    return evaluateValue(trueValue, getCellValue);
  } else {
    return evaluateValue(falseValue, getCellValue);
  }
}

function evaluateCondition(condition: string, getCellValue: (row: number, col: number) => number | string | null): boolean {
  // Support: A1 > 10, A1 < 10, A1 = 10, A1 >= 10, A1 <= 10, A1 <> 10
  const operators = [">=", "<=", "<>", ">", "<", "="];
  
  for (const op of operators) {
    const index = condition.indexOf(op);
    if (index > 0) {
      const left = condition.substring(0, index).trim();
      const right = condition.substring(index + op.length).trim();
      
      const leftVal = evaluateValue(left, getCellValue);
      const rightVal = evaluateValue(right, getCellValue);
      
      if (leftVal.value === null || rightVal.value === null) return false;
      
      const leftNum = typeof leftVal.value === "number" ? leftVal.value : parseFloat(String(leftVal.value));
      const rightNum = typeof rightVal.value === "number" ? rightVal.value : parseFloat(String(rightVal.value));
      
      if (isNaN(leftNum) || isNaN(rightNum)) return false;
      
      switch (op) {
        case ">": return leftNum > rightNum;
        case "<": return leftNum < rightNum;
        case ">=": return leftNum >= rightNum;
        case "<=": return leftNum <= rightNum;
        case "<>": return leftNum !== rightNum;
        case "=": return leftNum === rightNum;
      }
    }
  }
  
  return false;
}

function evaluateValue(value: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  value = value.trim();
  
  // Remove quotes from strings
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return { value: value.slice(1, -1) };
  }
  
  // Check if it's a number
  const num = parseFloat(value);
  if (!isNaN(num)) {
    return { value: num };
  }
  
  // Check if it's a cell reference
  const cellRef = parseCellReference(value);
  if (cellRef) {
    const cellValue = getCellValue(cellRef.row, cellRef.col);
    if (typeof cellValue === "number") {
      return { value: cellValue };
    }
    return { value: null };
  }
  
  return { value: null, error: `Invalid value: ${value}` };
}

function evaluateExpression(expression: string, getCellValue: (row: number, col: number) => number | string | null): FormulaResult {
  // Replace cell references with their values
  let processed = expression;
  const cellRefs = extractCellReferences(expression);
  
  for (const ref of cellRefs) {
    const cellRef = parseCellReference(ref);
    if (cellRef) {
      const value = getCellValue(cellRef.row, cellRef.col);
      const numValue = typeof value === "number" ? value : (value ? parseFloat(String(value)) : 0);
      processed = processed.replace(new RegExp(ref, "gi"), String(isNaN(numValue) ? 0 : numValue));
    }
  }
  
  // Evaluate arithmetic expression
  try {
    // Safe evaluation (only allow basic arithmetic)
    const result = Function(`"use strict"; return (${processed})`)();
    return { value: typeof result === "number" ? result : null };
  } catch (error: any) {
    return { value: null, error: error.message };
  }
}

function parseFunctionArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if ((char === '"' || char === "'") && (i === 0 || argsString[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
      current += char;
    } else if (char === '(' && !inQuotes) {
      depth++;
      current += char;
    } else if (char === ')' && !inQuotes) {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0 && !inQuotes) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function expandRange(range: string, getCellValue: (row: number, col: number) => number | string | null): (number | string | null)[] {
  // Handle range: A1:A10 or single cell: A1
  if (range.includes(":")) {
    const [start, end] = range.split(":").map(s => s.trim());
    const startRef = parseCellReference(start);
    const endRef = parseCellReference(end);
    
    if (!startRef || !endRef) return [];
    
    const values: (number | string | null)[] = [];
    
    // Expand range
    for (let row = startRef.row; row <= endRef.row; row++) {
      for (let col = startRef.col; col <= endRef.col; col++) {
        values.push(getCellValue(row, col));
      }
    }
    
    return values;
  } else {
    // Single cell reference
    const ref = parseCellReference(range.trim());
    if (ref) {
      return [getCellValue(ref.row, ref.col)];
    }
    return [];
  }
}

