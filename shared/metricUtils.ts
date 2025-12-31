/**
 * Metric Utilities
 * Shared utilities for metric name normalization and fallback logic
 */

/**
 * Normalize a metric name for matching (case-insensitive, handles spaces/parentheses)
 */
export function normalizeMetricName(metricName: string): string {
  return metricName.toLowerCase().replace(/[()%]/g, '').replace(/\s+/g, '');
}

/**
 * Check if a metric name refers to OPM (Operating Profit Margin)
 */
export function isOPMMetric(metricName: string): boolean {
  const normalized = normalizeMetricName(metricName);
  return normalized.includes('opm') || 
         normalized.includes('operatingprofitmargin') ||
         normalized.includes('operatingmargin');
}

/**
 * Get Financing Margin metric name variations
 * Returns all possible variations of Financing Margin that should be tried as fallback
 */
export function getFinancingMarginVariations(): string[] {
  return [
    'Financing Margin %',
    'Financing Margin',
    'financingmargin',
    'financing_margin',
    'FinancingMargin',
    'financing margin %',
    'financing margin'
  ];
}

/**
 * Find metric value with OPM fallback to Financing Margin
 * This function implements the logic: if OPM is requested but not available, use Financing Margin instead
 * 
 * @param metrics - Map or object containing metric names as keys and values
 * @param requestedMetric - The metric name being requested (e.g., "OPM %")
 * @param findMetricFn - Function to find a metric value by name in the metrics object
 * @returns The metric value (OPM if available, Financing Margin if OPM not available, null if neither)
 */
export function findMetricWithOPMFallback<T>(
  metrics: T,
  requestedMetric: string,
  findMetricFn: (metrics: T, metricName: string) => number | null | undefined
): number | null {
  // First, try to find the requested metric
  let value = findMetricFn(metrics, requestedMetric);
  
  // If value is null/undefined and the requested metric is OPM-related, try Financing Margin as fallback
  if ((value === null || value === undefined) && isOPMMetric(requestedMetric)) {
    const financingMarginVariations = getFinancingMarginVariations();
    
    for (const fmName of financingMarginVariations) {
      const fmValue = findMetricFn(metrics, fmName);
      if (fmValue !== null && fmValue !== undefined) {
        value = fmValue;
        // Log the fallback (optional, can be removed in production)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[METRIC-UTILS] OPM "${requestedMetric}" not found, using Financing Margin "${fmName}": ${value}`);
        }
        break;
      }
    }
  }
  
  return value ?? null;
}

/**
 * Find metric in a list of available metrics with OPM fallback
 * Useful for client-side metric lookups
 */
export function findMetricInListWithOPMFallback(
  requestedMetric: string,
  availableMetrics: string[]
): string | null {
  // Normalize the requested metric
  const normalizedRequested = normalizeMetricName(requestedMetric);
  
  // First, try exact match
  for (const metric of availableMetrics) {
    if (normalizeMetricName(metric) === normalizedRequested) {
      return metric;
    }
  }
  
  // Try partial match
  for (const metric of availableMetrics) {
    const metricNormalized = normalizeMetricName(metric);
    if (metricNormalized.includes(normalizedRequested) || normalizedRequested.includes(metricNormalized)) {
      return metric;
    }
  }
  
  // If requested metric is OPM-related and not found, try Financing Margin as fallback
  if (isOPMMetric(requestedMetric)) {
    const financingMarginVariations = getFinancingMarginVariations();
    
    for (const fmName of financingMarginVariations) {
      const normalizedFM = normalizeMetricName(fmName);
      
      // Try exact match
      for (const metric of availableMetrics) {
        if (normalizeMetricName(metric) === normalizedFM) {
          return metric;
        }
      }
      
      // Try partial match
      for (const metric of availableMetrics) {
        const metricNormalized = normalizeMetricName(metric);
        if (metricNormalized.includes(normalizedFM) || normalizedFM.includes(metricNormalized)) {
          return metric;
        }
      }
    }
  }
  
  return null;
}

