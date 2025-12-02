import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Path to config directory (relative to project root)
const CONFIG_DIR = join(process.cwd(), "config");
const VISIBLE_METRICS_FILE = join(CONFIG_DIR, "visible_metrics.json");

// Default metrics configuration
const DEFAULT_VISIBLE_METRICS: Record<string, boolean> = {
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
      return JSON.parse(content);
    }
    // If file doesn't exist, initialize with defaults
    saveVisibleMetrics(DEFAULT_VISIBLE_METRICS);
    return DEFAULT_VISIBLE_METRICS;
  } catch (error: any) {
    console.error("Error loading visible metrics:", error);
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
 */
export function getAllMetrics(): string[] {
  const visibleMetrics = loadVisibleMetrics();
  if (Object.keys(visibleMetrics).length > 0) {
    return Object.keys(visibleMetrics);
  }
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

