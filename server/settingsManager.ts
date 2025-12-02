import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Path to config directory (relative to project root)
const CONFIG_DIR = join(process.cwd(), "config");
const VISIBLE_METRICS_FILE = join(CONFIG_DIR, "visible_metrics.json");

// Default metrics configuration
export const DEFAULT_VISIBLE_METRICS: Record<string, boolean> = {
  "Sales": true,
  "Sales Growth(YoY) %": true,
  "Sales Growth(QoQ) %": true,
  "Expenses": false,
  "Operating Profit": false,
  "OPM %": true,
  "Financing Profit": false,
  "Financing Margin %": false,
  "Other Income": false,
  "Interest": false,
  "Depreciation": false,
  "Profit before tax": false,
  "Tax %": false,
  "Net Profit": false,
  "EPS in Rs": true,
  "EPS Growth(YoY) %": true,
  "EPS Growth(QoQ) %": true,
  "Gross NPA %": false
};

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load visible metrics configuration
 */
export function loadVisibleMetrics(): Record<string, boolean> {
  try {
    ensureConfigDir();
    if (existsSync(VISIBLE_METRICS_FILE)) {
      const content = readFileSync(VISIBLE_METRICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      // If file exists but is empty or invalid, use defaults
      if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
        saveVisibleMetrics(DEFAULT_VISIBLE_METRICS);
        return DEFAULT_VISIBLE_METRICS;
      }
      return parsed;
    }
    // If file doesn't exist, initialize with defaults
    saveVisibleMetrics(DEFAULT_VISIBLE_METRICS);
    return DEFAULT_VISIBLE_METRICS;
  } catch (error: any) {
    console.error("Error loading visible metrics:", error);
    // If there's an error, ensure defaults are saved and returned
    try {
      saveVisibleMetrics(DEFAULT_VISIBLE_METRICS);
    } catch (saveError) {
      console.error("Error saving default metrics:", saveError);
    }
    return DEFAULT_VISIBLE_METRICS;
  }
}

/**
 * Save visible metrics configuration
 */
export function saveVisibleMetrics(metrics: Record<string, boolean>): boolean {
  try {
    ensureConfigDir();
    writeFileSync(VISIBLE_METRICS_FILE, JSON.stringify(metrics, null, 2), "utf-8");
    return true;
  } catch (error: any) {
    console.error("Error saving visible metrics:", error);
    return false;
  }
}

/**
 * Get list of all available metrics
 * Always returns at least the default metrics
 */
export function getAllMetrics(): string[] {
  const visibleMetrics = loadVisibleMetrics();
  const metricKeys = Object.keys(visibleMetrics);
  // If we have metrics, use them; otherwise use defaults
  if (metricKeys.length > 0) {
    return metricKeys;
  }
  // Ensure we always return default metrics
  return Object.keys(DEFAULT_VISIBLE_METRICS);
}

/**
 * Get list of metrics that should be visible by default
 */
export function getVisibleMetrics(): string[] {
  const visibleMetrics = loadVisibleMetrics();
  return Object.entries(visibleMetrics)
    .filter(([_, isVisible]) => isVisible)
    .map(([metric, _]) => metric);
}

