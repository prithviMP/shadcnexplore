/**
 * Main Signal Evaluator
 * Implements the primary signal calculation formula from Excel
 * 
 * Formula structure:
 * Q12-Q16: Current quarter metrics (Sales YoY%, EPS YoY%, OPM%, Sales QoQ%, EPS QoQ%)
 * P12-P16: Previous quarter metrics (same order)
 */

import type { QuarterlyData } from "@shared/schema";
import { storage } from "./storage";

interface QuarterlyDataGrouped {
  quarter: string;
  metrics: Record<string, string | null>;
}

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

type SignalResult = "BUY" | "Check_OPM (Sell)" | "No Signal";

/**
 * Extract quarterly metrics from quarterly data
 */
function extractQuarterlyMetrics(quarterlyData: QuarterlyDataGrouped[]): QuarterlyMetrics {
  const metrics: QuarterlyMetrics = {
    Q12: null, Q13: null, Q14: null, Q15: null, Q16: null,
    P12: null, P13: null, P14: null, P15: null, P16: null,
  };

  if (!quarterlyData || quarterlyData.length === 0) {
    return metrics;
  }

  // Sort by quarter (most recent first)
  const sortedData = [...quarterlyData].sort((a, b) => {
    const aQuarter = a.quarter;
    const bQuarter = b.quarter;
    // Compare quarters (e.g., "2024-Q3" > "2024-Q2")
    return bQuarter.localeCompare(aQuarter);
  });

  if (sortedData.length === 0) return metrics;

  // Get current quarter (most recent)
  const currentQuarter = sortedData[0];
  
  // Get previous quarter (if available)
  const previousQuarter = sortedData.length > 1 ? sortedData[1] : null;

  // Helper to find metric value
  const findMetric = (quarter: QuarterlyDataGrouped, metricName: string): number | null => {
    const metric = quarter.metrics[metricName];
    if (metric === null || metric === undefined) return null;
    
    // Handle string values with %
    if (typeof metric === 'string') {
      const cleaned = metric.replace('%', '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    
    return typeof metric === 'number' ? metric : null;
  };

  // Helper to find metric by variations (case-insensitive, handles spaces/parentheses)
  const findMetricByVariations = (quarter: QuarterlyDataGrouped, variations: string[]): number | null => {
    // First try exact matches
    for (const variation of variations) {
      const value = findMetric(quarter, variation);
      if (value !== null) return value;
    }
    
    // Then try case-insensitive matching
    const quarterMetricKeys = Object.keys(quarter.metrics);
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
  // Q12: Sales Growth (YoY) %
  metrics.Q12 = findMetricByVariations(currentQuarter, [
    'Sales Growth(YoY) %',  // Exact format from scraper
    'Sales Growth (YoY) %',
    'Sales Growth YoY %',
    'Sales YoY %',
    'Revenue Growth YoY %',
    'sales_yoy_percent'
  ]);

  // Q13: EPS Growth (YoY) %
  metrics.Q13 = findMetricByVariations(currentQuarter, [
    'EPS Growth(YoY) %',  // Exact format from scraper
    'EPS Growth (YoY) %',
    'EPS Growth YoY %',
    'EPS YoY %',
    'eps_yoy_percent'
  ]);

  // Q14: OPM %
  metrics.Q14 = findMetricByVariations(currentQuarter, [
    'OPM %',
    'Operating Profit Margin %',
    'Operating Margin %',
    'opm_percent',
    'operating_profit_margin'
  ]);

  // Q15: Sales Growth (QoQ) %
  metrics.Q15 = findMetricByVariations(currentQuarter, [
    'Sales Growth(QoQ) %',  // Exact format from scraper
    'Sales Growth (QoQ) %',
    'Sales Growth QoQ %',
    'Sales QoQ %',
    'Revenue Growth QoQ %',
    'sales_qoq_percent'
  ]);

  // Q16: EPS Growth (QoQ) %
  metrics.Q16 = findMetricByVariations(currentQuarter, [
    'EPS Growth(QoQ) %',  // Exact format from scraper
    'EPS Growth (QoQ) %',
    'EPS Growth QoQ %',
    'EPS QoQ %',
    'eps_qoq_percent'
  ]);

  // Extract previous quarter metrics (P) if available
  if (previousQuarter) {
    metrics.P12 = findMetricByVariations(previousQuarter, [
      'Sales Growth(YoY) %',  // Exact format from scraper
      'Sales Growth (YoY) %',
      'Sales Growth YoY %',
      'Sales YoY %',
      'Revenue Growth YoY %',
      'sales_yoy_percent'
    ]);

    metrics.P13 = findMetricByVariations(previousQuarter, [
      'EPS Growth(YoY) %',  // Exact format from scraper
      'EPS Growth (YoY) %',
      'EPS Growth YoY %',
      'EPS YoY %',
      'eps_yoy_percent'
    ]);

    metrics.P14 = findMetricByVariations(previousQuarter, [
      'OPM %',
      'Operating Profit Margin %',
      'Operating Margin %',
      'opm_percent',
      'operating_profit_margin'
    ]);

    metrics.P15 = findMetricByVariations(previousQuarter, [
      'Sales Growth(QoQ) %',  // Exact format from scraper
      'Sales Growth (QoQ) %',
      'Sales Growth QoQ %',
      'Sales QoQ %',
      'Revenue Growth QoQ %',
      'sales_qoq_percent'
    ]);

    metrics.P16 = findMetricByVariations(previousQuarter, [
      'EPS Growth(QoQ) %',  // Exact format from scraper
      'EPS Growth (QoQ) %',
      'EPS Growth QoQ %',
      'EPS QoQ %',
      'eps_qoq_percent'
    ]);
  }

  return metrics;
}

/**
 * Check if a value is a valid number
 */
function isNumber(value: number | null): boolean {
  return value !== null && value !== undefined && !isNaN(value);
}

/**
 * Calculate percentage change
 */
function percentageChange(current: number, previous: number): number {
  if (previous === 0) return current >= 0 ? Infinity : -Infinity;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Main signal evaluation function
 * Implements the Excel formula logic
 */
export function evaluateMainSignal(quarterlyData: QuarterlyDataGrouped[]): SignalResult {
  const m = extractQuarterlyMetrics(quarterlyData);

  // Check if all required values are numbers
  const allQNumbers = isNumber(m.Q12) && isNumber(m.Q13) && isNumber(m.Q14) && 
                      isNumber(m.Q15) && isNumber(m.Q16);
  const allPNumbers = isNumber(m.P12) && isNumber(m.P13) && isNumber(m.P14) && 
                      isNumber(m.P15) && isNumber(m.P16);

  if (!allQNumbers || !allPNumbers) {
    return "No Signal";
  }

  // Ensure we have valid numbers (convert null to 0 for calculations, but check first)
  const Q12 = m.Q12!;
  const Q13 = m.Q13!;
  const Q14 = m.Q14!;
  const Q15 = m.Q15!;
  const Q16 = m.Q16!;
  const P12 = m.P12!;
  const P13 = m.P13!;
  const P14 = m.P14!;
  const P15 = m.P15!;
  const P16 = m.P16!;

  // BUY Signal Conditions
  const buyConditions = 
    Q14 > 0 &&                                    // Q14>0
    P14 > 0 &&                                    // P14>0
    Q12 >= 20 &&                                  // Q12>=20%
    Q15 >= 20 &&                                  // Q15>=20%
    (
      // OR condition 1: MIN(Q13,Q16)>=5% AND (Q13>=10% OR Q16>=10%)
      (Math.min(Q13, Q16) >= 5 && (Q13 >= 10 || Q16 >= 10)) ||
      // OR condition 2: Q16>=5% AND Q16<10% AND Q13>=100%
      (Q16 >= 5 && Q16 < 10 && Q13 >= 100) ||
      // OR condition 3: Q13<0 AND Q16>=10%
      (Q13 < 0 && Q16 >= 10)
    ) &&
    P12 >= 10 &&                                  // P12>=10%
    (
      // OR condition: (P13>0 AND P15>0) OR (P13>0 AND P16>0) OR (P15>0 AND P16>0)
      (P13 > 0 && P15 > 0) ||
      (P13 > 0 && P16 > 0) ||
      (P15 > 0 && P16 > 0)
    ) &&
    (P16 >= 0 || P13 >= 10) &&                    // OR(P16>=0, P13>=10)
    (P13 >= 0 || P16 >= 10) &&                    // OR(P13>=0, P16>=10)
    (
      // OR condition: P15>=0 OR (P15<0 AND Q13>=0 AND Q16>=0)
      P15 >= 0 ||
      (P15 < 0 && Q13 >= 0 && Q16 >= 0)
    );

  if (buyConditions) {
    return "BUY";
  }

  // Check_OPM (Sell) Signal Conditions
  const sellConditions =
    (
      // Condition 1: P13<10% AND Q13<10% AND Q15<P15 AND Q16<P16
      (P13 < 10 && Q13 < 10 && Q15 < P15 && Q16 < P16) ||
      // Condition 2: Q13<0 AND Q16<0
      (Q13 < 0 && Q16 < 0) ||
      // Condition 3: Q16<0 AND Q15<0 AND (Q13<0 OR Q12<10%)
      (Q16 < 0 && Q15 < 0 && (Q13 < 0 || Q12 < 10)) ||
      // Condition 4: (Q13<5% OR Q16<5%) AND percentage change conditions
      (
        (Q13 < 5 || Q16 < 5) &&
        (
          // IF(ABS(P12)>0, (Q12 - P12)/ABS(P12) <= -15%, Q12<0)
          (P12 !== 0 ? percentageChange(Q12, P12) <= -15 : Q12 < 0) ||
          // IF(ABS(P15)>0, (Q15 - P15)/ABS(P15) <= -15%, Q15<0)
          (P15 !== 0 ? percentageChange(Q15, P15) <= -15 : Q15 < 0)
        )
      ) ||
      // Condition 5: Q12<20% AND Q13<5%
      (Q12 < 20 && Q13 < 5)
    );

  if (sellConditions) {
    return "Check_OPM (Sell)";
  }

  return "No Signal";
}

/**
 * Evaluate main signal for a company by ticker
 */
export async function evaluateMainSignalForCompany(ticker: string): Promise<SignalResult> {
  try {
    const quarterlyData = await storage.getQuarterlyDataByTicker(ticker);
    
    if (!quarterlyData || quarterlyData.length === 0) {
      return "No Signal";
    }

    // Group by quarter
    const quartersMap = new Map<string, Record<string, string | null>>();
    
    quarterlyData.forEach(item => {
      if (!quartersMap.has(item.quarter)) {
        quartersMap.set(item.quarter, {});
      }
      quartersMap.get(item.quarter)![item.metricName] = item.metricValue;
    });

    // Convert to QuarterlyDataGrouped format
    const quarterlyDataFormatted: QuarterlyDataGrouped[] = Array.from(quartersMap.entries()).map(([quarter, metrics]) => ({
      quarter,
      metrics
    }));

    return evaluateMainSignal(quarterlyDataFormatted);
  } catch (error) {
    console.error(`Error evaluating main signal for ${ticker}:`, error);
    return "No Signal";
  }
}

