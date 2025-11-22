/**
 * Quarterly Formula Evaluator
 * Evaluates formulas on quarterly financial data
 */

interface QuarterlyData {
  quarters: Array<{
    quarter: string;
    metrics: Record<string, string | null>;
  }>;
}

interface Formula {
  condition: string;
  signal: string;
}

/**
 * Normalize metric name for matching
 * Handles variations like "Sales", "Sales Growth(YoY) %", etc.
 */
function normalizeMetricName(metricName: string): string {
  return metricName
    .toLowerCase()
    .replace(/[()%]/g, '')
    .replace(/\s+/g, '_')
    .replace(/growth_yoy/g, 'yoy')
    .replace(/growth_qoq/g, 'qoq');
}

/**
 * Find metric in quarterly data by name (fuzzy matching)
 */
function findMetricInData(metricName: string, availableMetrics: string[]): string | null {
  const normalized = normalizeMetricName(metricName);
  
  // Exact match first
  for (const metric of availableMetrics) {
    if (normalizeMetricName(metric) === normalized) {
      return metric;
    }
  }
  
  // Partial match
  for (const metric of availableMetrics) {
    const metricNormalized = normalizeMetricName(metric);
    if (metricNormalized.includes(normalized) || normalized.includes(metricNormalized)) {
      return metric;
    }
  }
  
  // Try common variations
  const variations: Record<string, string[]> = {
    'sales': ['sales', 'revenue', 'total_revenue'],
    'eps': ['eps', 'earnings_per_share', 'eps_in_rs'],
    'operating_profit': ['operating_profit', 'op', 'operating_profit_margin'],
    'net_profit': ['net_profit', 'profit_after_tax', 'pat'],
    'roe': ['roe', 'return_on_equity'],
    'opm': ['opm', 'operating_profit_margin', 'opm_percent'],
  };
  
  for (const [key, aliases] of Object.entries(variations)) {
    if (aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
      for (const metric of availableMetrics) {
        const metricNormalized = normalizeMetricName(metric);
        if (aliases.some(alias => metricNormalized.includes(alias))) {
          return metric;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract metric values from selected quarters
 */
function extractMetricValues(
  quarterlyData: QuarterlyData,
  selectedQuarters: string[],
  metricKey: string
): number[] {
  const quarters = selectedQuarters.length > 0 
    ? quarterlyData.quarters.filter(q => selectedQuarters.includes(q.quarter))
    : quarterlyData.quarters.slice(0, 1); // Default to latest quarter
  
  const values: number[] = [];
  
  for (const quarter of quarters) {
    const value = quarter.metrics[metricKey];
    if (value !== null && value !== undefined) {
      // Handle percentage strings
      const numValue = typeof value === 'string' && value.includes('%')
        ? parseFloat(value.replace('%', ''))
        : parseFloat(value);
      if (!isNaN(numValue)) {
        values.push(numValue);
      }
    }
  }
  
  return values;
}

/**
 * Parse formula condition
 * Supports: "Sales > 100000", "EPS > 10 AND Sales > 50000", etc.
 */
function parseCondition(condition: string): {
  parts: Array<{ metric: string; operator: string; value: number }>;
  logicOperator: 'AND' | 'OR';
} {
  const trimmed = condition.trim();
  const hasAnd = /\s+AND\s+/i.test(trimmed);
  const hasOr = /\s+OR\s+/i.test(trimmed);
  
  const logicOperator: 'AND' | 'OR' = hasAnd ? 'AND' : hasOr ? 'OR' : 'AND';
  const separator = hasAnd ? /\s+AND\s+/i : hasOr ? /\s+OR\s+/i : null;
  
  const parts = separator ? trimmed.split(separator) : [trimmed];
  
  const parsedParts: Array<{ metric: string; operator: string; value: number }> = [];
  
  for (const part of parts) {
    // Match: "metric operator value" (e.g., "Sales > 100000")
    const match = part.trim().match(/^([A-Za-z\s()%]+?)\s*([><=!]+)\s*(-?\d+\.?\d*)$/);
    if (match) {
      const [, metricName, operator, valueStr] = match;
      parsedParts.push({
        metric: metricName.trim(),
        operator: operator.trim(),
        value: parseFloat(valueStr),
      });
    }
  }
  
  return { parts: parsedParts, logicOperator };
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  value: number,
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '=': return Math.abs(value - threshold) < 0.01;
    case '!=': return Math.abs(value - threshold) >= 0.01;
    default: return false;
  }
}

/**
 * Evaluate formula on quarterly data
 * Returns signal (BUY/SELL/HOLD) or null if condition doesn't match
 */
export function evaluateQuarterlyFormula(
  quarterlyData: QuarterlyData,
  selectedQuarters: string[],
  formula: Formula,
  availableMetrics: string[]
): string | null {
  if (!quarterlyData || quarterlyData.quarters.length === 0) {
    return null;
  }
  
  try {
    const { parts, logicOperator } = parseCondition(formula.condition);
    
    if (parts.length === 0) {
      return null;
    }
    
    const conditionResults: boolean[] = [];
    
    for (const part of parts) {
      // Find the metric in available metrics
      const metricKey = findMetricInData(part.metric, availableMetrics);
      
      if (!metricKey) {
        // Metric not found, condition fails
        conditionResults.push(false);
        continue;
      }
      
      // Extract values from selected quarters
      const values = extractMetricValues(quarterlyData, selectedQuarters, metricKey);
      
      if (values.length === 0) {
        // No values available, condition fails
        conditionResults.push(false);
        continue;
      }
      
      // Use average if multiple quarters, or latest value
      const valueToCheck = values.length > 1 
        ? values.reduce((a, b) => a + b, 0) / values.length
        : values[0];
      
      // Evaluate condition
      const result = evaluateCondition(valueToCheck, part.operator, part.value);
      conditionResults.push(result);
    }
    
    // Combine results based on logic operator
    let finalResult: boolean;
    if (logicOperator === 'AND') {
      finalResult = conditionResults.every(r => r === true);
    } else {
      finalResult = conditionResults.some(r => r === true);
    }
    
    // Return signal if condition matches
    return finalResult ? formula.signal.toUpperCase() : null;
  } catch (error) {
    console.error('Error evaluating formula:', error);
    return null;
  }
}

/**
 * Evaluate formula for a specific metric row
 * This evaluates the formula using values from that metric across selected quarters
 * The formula can reference multiple metrics, but we evaluate it in the context of the current row
 */
export function evaluateFormulaForMetric(
  quarterlyData: QuarterlyData,
  selectedQuarters: string[],
  formula: Formula,
  metricKey: string
): string | null {
  if (!quarterlyData || quarterlyData.quarters.length === 0) {
    return null;
  }
  
  try {
    const { parts, logicOperator } = parseCondition(formula.condition);
    
    if (parts.length === 0) {
      return null;
    }
    
    const conditionResults: boolean[] = [];
    const availableMetrics = quarterlyData.quarters[0] ? Object.keys(quarterlyData.quarters[0].metrics) : [];
    
    for (const part of parts) {
      // Find which metric this condition refers to
      const partMetricKey = findMetricInData(part.metric, availableMetrics);
      
      if (!partMetricKey) {
        // Metric not found, condition fails
        conditionResults.push(false);
        continue;
      }
      
      // Extract values for the metric referenced in this condition from selected quarters
      const values = extractMetricValues(quarterlyData, selectedQuarters, partMetricKey);
      
      if (values.length === 0) {
        conditionResults.push(false);
        continue;
      }
      
      // Use average if multiple quarters, or latest value
      const valueToCheck = values.length > 1 
        ? values.reduce((a, b) => a + b, 0) / values.length
        : values[0];
      
      // Evaluate condition
      const result = evaluateCondition(valueToCheck, part.operator, part.value);
      conditionResults.push(result);
    }
    
    if (conditionResults.length === 0) {
      return null;
    }
    
    // Combine results based on logic operator
    let finalResult: boolean;
    if (logicOperator === 'AND') {
      finalResult = conditionResults.every(r => r === true);
    } else {
      finalResult = conditionResults.some(r => r === true);
    }
    
    // Return signal if condition matches
    return finalResult ? formula.signal.toUpperCase() : null;
  } catch (error) {
    console.error('Error evaluating formula for metric:', error);
    return null;
  }
}

