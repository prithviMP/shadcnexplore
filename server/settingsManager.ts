import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Path to config directory (relative to project root)
const CONFIG_DIR = join(process.cwd(), "config");
const VISIBLE_METRICS_FILE = join(CONFIG_DIR, "visible_metrics.json");

// Database storage instance (lazy loaded to avoid circular dependencies)
let dbStorage: any = null;
async function getDbStorage() {
  if (!dbStorage) {
    const { storage } = await import("./storage");
    dbStorage = storage;
  }
  return dbStorage;
}

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

// Default banking-specific metrics configuration
export const DEFAULT_BANKING_METRICS: Record<string, boolean> = {
  "Sales Growth(YoY) %": true,
  "Sales Growth(QoQ) %": true,
  "Financing Profit": true,
  "Financing Margin %": true,
  "EPS in Rs": true,
  "EPS Growth(YoY) %": true,
  "EPS Growth(QoQ) %": true,
  "Gross NPA %": true
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
 * Load visible metrics configuration from database
 * Falls back to JSON file if database doesn't have it yet
 */
export async function loadVisibleMetrics(): Promise<Record<string, boolean>> {
  try {
    const storage = await getDbStorage();
    const setting = await storage.getAppSetting("default_metrics");
    
    if (setting && setting.value && typeof setting.value === 'object') {
      const metrics = setting.value as Record<string, boolean>;
      // Validate that it's a proper metrics object
      if (Object.keys(metrics).length > 0) {
        return metrics;
      }
    }
    
    // If not in database, try to load from JSON file (for migration)
    ensureConfigDir();
    if (existsSync(VISIBLE_METRICS_FILE)) {
      const content = readFileSync(VISIBLE_METRICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        // Migrate from JSON to database
        await saveVisibleMetrics(parsed);
        return parsed;
      }
    }
    
    // If neither exists, initialize with defaults in database
    await saveVisibleMetrics(DEFAULT_VISIBLE_METRICS);
    return DEFAULT_VISIBLE_METRICS;
  } catch (error: any) {
    console.error("Error loading visible metrics from database:", error);
    // Fallback to JSON file if database fails
    try {
      ensureConfigDir();
      if (existsSync(VISIBLE_METRICS_FILE)) {
        const content = readFileSync(VISIBLE_METRICS_FILE, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (fileError) {
      console.error("Error loading from JSON file:", fileError);
    }
    // Last resort: return defaults
    return DEFAULT_VISIBLE_METRICS;
  }
}

/**
 * Save visible metrics configuration to database
 * Also saves to JSON file as backup
 */
export async function saveVisibleMetrics(metrics: Record<string, boolean>): Promise<boolean> {
  try {
    const storage = await getDbStorage();
    await storage.setAppSetting(
      "default_metrics",
      metrics,
      "Default metrics configuration for displaying quarterly data"
    );
    
    // Also save to JSON file as backup
    try {
      ensureConfigDir();
      writeFileSync(VISIBLE_METRICS_FILE, JSON.stringify(metrics, null, 2), "utf-8");
    } catch (fileError) {
      console.warn("Warning: Failed to save metrics to JSON file (database save succeeded):", fileError);
    }
    
    return true;
  } catch (error: any) {
    console.error("Error saving visible metrics to database:", error);
    // Fallback to JSON file if database fails
    try {
      ensureConfigDir();
      writeFileSync(VISIBLE_METRICS_FILE, JSON.stringify(metrics, null, 2), "utf-8");
      return true;
    } catch (fileError) {
      console.error("Error saving to JSON file:", fileError);
      return false;
    }
  }
}

/**
 * Get list of all available metrics
 * Always returns at least the default metrics
 */
export async function getAllMetrics(): Promise<string[]> {
  const visibleMetrics = await loadVisibleMetrics();
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
export async function getVisibleMetrics(): Promise<string[]> {
  const visibleMetrics = await loadVisibleMetrics();
  return Object.entries(visibleMetrics)
    .filter(([_, isVisible]) => isVisible)
    .map(([metric, _]) => metric);
}

/**
 * Load banking-specific metrics configuration from database
 * Falls back to JSON file if database doesn't have it yet
 */
export async function loadBankingMetrics(): Promise<Record<string, boolean>> {
  try {
    const storage = await getDbStorage();
    const setting = await storage.getAppSetting("default_metrics_banking");
    
    if (setting && setting.value && typeof setting.value === 'object') {
      const metrics = setting.value as Record<string, boolean>;
      if (Object.keys(metrics).length > 0) {
        return metrics;
      }
    }
    
    // If not in database, initialize with defaults in database
    await saveBankingMetrics(DEFAULT_BANKING_METRICS);
    return DEFAULT_BANKING_METRICS;
  } catch (error: any) {
    console.error("Error loading banking metrics from database:", error);
    return DEFAULT_BANKING_METRICS;
  }
}

/**
 * Save banking-specific metrics configuration to database
 */
export async function saveBankingMetrics(metrics: Record<string, boolean>): Promise<boolean> {
  try {
    const storage = await getDbStorage();
    await storage.setAppSetting(
      "default_metrics_banking",
      metrics,
      "Default metrics configuration for banking companies/sectors"
    );
    return true;
  } catch (error: any) {
    console.error("Error saving banking metrics to database:", error);
    return false;
  }
}

/**
 * Get list of banking metrics that should be visible by default
 */
export async function getVisibleBankingMetrics(): Promise<string[]> {
  const bankingMetrics = await loadBankingMetrics();
  return Object.entries(bankingMetrics)
    .filter(([_, isVisible]) => isVisible)
    .map(([metric, _]) => metric);
}

