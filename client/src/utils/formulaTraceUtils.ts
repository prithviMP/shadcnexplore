// Type definitions for formula evaluation trace
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
  result: string | number | boolean | null;
  usedQuarters: string[];
  evaluationTime: number;
}

/**
 * Format evaluation step for display
 */
export function formatEvaluationStep(step: EvaluationStep): string {
  const typeLabels: Record<EvaluationStep['type'], string> = {
    metric_lookup: '📊 Metric Lookup',
    function_call: '🔧 Function Call',
    comparison: '⚖️ Comparison',
    arithmetic: '🔢 Arithmetic',
    logical: '🧠 Logical',
    unary: '🔀 Unary',
  };

  return `${typeLabels[step.type] || step.type}: ${step.description}`;
}

/**
 * Get result explanation text
 */
export function getResultExplanation(result: string | number | boolean | null, trace: FormulaTrace): string {
  if (result === null || result === undefined) {
    return "Formula evaluation resulted in null/undefined, converted to 'No Signal'.";
  }

  if (typeof result === 'string') {
    if (result === 'No Signal') {
      return "Formula evaluation returned 'No Signal'. This typically means the conditions in the formula were not met, or required data was missing.";
    }
    return `Formula evaluation returned signal: "${result}". This signal is generated when the formula conditions evaluate to this result.`;
  }

  if (typeof result === 'boolean') {
    return result 
      ? "Formula evaluation returned true. The conditions in the formula were satisfied."
      : "Formula evaluation returned false. The conditions in the formula were not satisfied.";
  }

  if (typeof result === 'number') {
    return `Formula evaluation returned numeric value: ${result}. This is the calculated result from the formula.`;
  }

  return "Formula evaluation completed successfully.";
}
