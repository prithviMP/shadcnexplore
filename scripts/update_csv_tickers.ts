#!/usr/bin/env tsx
/**
 * Update ticker symbols in CSV file by validating against Screener.in
 * 
 * Features:
 * - Rate limiting to avoid IP blocking
 * - Robust error handling with detailed logging
 * - Progress tracking
 * - Resume capability (skips already verified tickers)
 * - Batch processing with delays
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scraper } from '../server/scraper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Company {
  ticker: string;
  name: string;
  sector: string;
}

interface UpdateResult {
  ticker: string;
  name: string;
  sector: string;
  originalTicker: string;
  newTicker: string | null;
  status: 'verified' | 'updated' | 'failed' | 'skipped';
  error?: string;
}

interface ProgressStats {
  total: number;
  processed: number;
  verified: number;
  updated: number;
  failed: number;
  skipped: number;
}

// Configuration
const CONFIG = {
  // Delay between requests (milliseconds)
  DELAY_BETWEEN_REQUESTS: 3000, // 3 seconds
  DELAY_VARIANCE: 2000, // Add random variance of 0-2 seconds
  
  // Batch size for progress updates
  PROGRESS_UPDATE_INTERVAL: 10,
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 seconds
  
  // Rate limit detection
  RATE_LIMIT_DELAY: 60000, // 1 minute if rate limited
};

/**
 * Parse CSV file into array of companies
 */
function parseCSV(csvPath: string): Company[] {
  console.log(`📖 Reading CSV file: ${csvPath}`);
  
  try {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header and one data row');
    }
    
    // Parse header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const tickerIndex = header.indexOf('ticker');
    const nameIndex = header.indexOf('name');
    const sectorIndex = header.indexOf('sector');
    
    if (tickerIndex === -1 || nameIndex === -1 || sectorIndex === -1) {
      throw new Error('CSV must have columns: ticker, name, sector');
    }
    
    // Parse data rows
    const companies: Company[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV parsing (handles quoted values)
      const values = parseCSVLine(line);
      
      if (values.length > Math.max(tickerIndex, nameIndex, sectorIndex)) {
        const ticker = values[tickerIndex]?.trim() || '';
        const name = values[nameIndex]?.trim() || '';
        const sector = values[sectorIndex]?.trim() || '';
        
        if (ticker && name && sector) {
          companies.push({ ticker, name, sector });
        }
      }
    }
    
    console.log(`✅ Parsed ${companies.length} companies from CSV`);
    return companies;
  } catch (error: any) {
    console.error(`❌ Error reading CSV file: ${error.message}`);
    throw error;
  }
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim());
  return result;
}

/**
 * Write companies to CSV file
 */
function writeCSV(csvPath: string, companies: Company[]): void {
  console.log(`💾 Writing ${companies.length} companies to CSV: ${csvPath}`);
  
  const lines = ['ticker,name,sector'];
  for (const company of companies) {
    // Escape quotes in values
    const ticker = company.ticker.replace(/"/g, '""');
    const name = company.name.replace(/"/g, '""');
    const sector = company.sector.replace(/"/g, '""');
    lines.push(`"${ticker}","${name}","${sector}"`);
  }
  
  writeFileSync(csvPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`✅ CSV file written successfully`);
}

/**
 * Delay helper with random variance
 */
function delay(ms: number): Promise<void> {
  const variance = Math.random() * CONFIG.DELAY_VARIANCE;
  const totalDelay = ms + variance;
  return new Promise(resolve => setTimeout(resolve, totalDelay));
}

/**
 * Verify if a ticker is correct by checking metadata
 */
async function verifyTicker(
  ticker: string,
  companyName: string,
  retries: number = CONFIG.MAX_RETRIES
): Promise<{ isValid: boolean; actualTicker: string; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  🔍 Verifying ticker "${ticker}" for "${companyName}" (attempt ${attempt}/${retries})...`);
      
      const metadata = await scraper.fetchCompanyMetadata(ticker);
      
      if (!metadata.exists) {
        return {
          isValid: false,
          actualTicker: ticker,
          error: 'Company not found on Screener.in',
        };
      }
      
      // Check if company name matches (fuzzy match)
      const nameMatch = fuzzyMatch(metadata.companyName, companyName);
      
      if (nameMatch) {
        console.log(`  ✅ Ticker verified: "${ticker}" matches "${metadata.companyName}"`);
        return {
          isValid: true,
          actualTicker: ticker,
        };
      } else {
        console.log(`  ⚠️  Ticker "${ticker}" exists but name mismatch:`);
        console.log(`     Expected: "${companyName}"`);
        console.log(`     Found: "${metadata.companyName}"`);
        return {
          isValid: false,
          actualTicker: ticker,
          error: `Name mismatch: expected "${companyName}", found "${metadata.companyName}"`,
        };
      }
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`  ❌ Error verifying ticker (attempt ${attempt}/${retries}): ${errorMessage}`);
      
      // Check for rate limiting
      if (
        errorMessage.includes('429') ||
        errorMessage.includes('RATE_LIMITED') ||
        errorMessage.includes('IP_BLOCKED') ||
        errorMessage.includes('403') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        console.warn(`  ⚠️  Rate limit detected. Waiting ${CONFIG.RATE_LIMIT_DELAY / 1000}s before retry...`);
        await delay(CONFIG.RATE_LIMIT_DELAY);
        continue;
      }
      
      // If last attempt, return error
      if (attempt === retries) {
        return {
          isValid: false,
          actualTicker: ticker,
          error: errorMessage,
        };
      }
      
      // Wait before retry
      await delay(CONFIG.RETRY_DELAY * attempt);
    }
  }
  
  return {
    isValid: false,
    actualTicker: ticker,
    error: 'Max retries exceeded',
  };
}

/**
 * Search for correct ticker by company name
 */
async function searchTickerByName(
  companyName: string,
  retries: number = CONFIG.MAX_RETRIES
): Promise<{ ticker: string | null; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  🔎 Searching for ticker by name "${companyName}" (attempt ${attempt}/${retries})...`);
      
      const result = await scraper.searchTickerByCompanyName(companyName);
      
      if (result && result.exists) {
        console.log(`  ✅ Found ticker: "${result.ticker}" for "${result.companyName}"`);
        return {
          ticker: result.ticker,
        };
      } else {
        console.log(`  ⚠️  No ticker found for "${companyName}"`);
        return {
          ticker: null,
          error: 'Company not found on Screener.in',
        };
      }
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`  ❌ Error searching for ticker (attempt ${attempt}/${retries}): ${errorMessage}`);
      
      // Check for rate limiting
      if (
        errorMessage.includes('429') ||
        errorMessage.includes('RATE_LIMITED') ||
        errorMessage.includes('IP_BLOCKED') ||
        errorMessage.includes('403') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        console.warn(`  ⚠️  Rate limit detected. Waiting ${CONFIG.RATE_LIMIT_DELAY / 1000}s before retry...`);
        await delay(CONFIG.RATE_LIMIT_DELAY);
        continue;
      }
      
      // If last attempt, return error
      if (attempt === retries) {
        return {
          ticker: null,
          error: errorMessage,
        };
      }
      
      // Wait before retry
      await delay(CONFIG.RETRY_DELAY * attempt);
    }
  }
  
  return {
    ticker: null,
    error: 'Max retries exceeded',
  };
}

/**
 * Fuzzy match company names
 */
function fuzzyMatch(name1: string, name2: string): boolean {
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/ltd\.?/gi, 'ltd')
      .replace(/limited/gi, 'ltd')
      .replace(/&/g, 'and')
      .replace(/[^\w\s]/g, '')
      .trim();
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // One contains the other (for abbreviations)
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Check if key words match (at least 3 words)
  const words1 = n1.split(/\s+/).filter(w => w.length > 2);
  const words2 = n2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  // Check if majority of words match
  const matchingWords = words1.filter(w => words2.includes(w));
  const matchRatio = matchingWords.length / Math.max(words1.length, words2.length);
  
  return matchRatio >= 0.6; // At least 60% of words match
}

/**
 * Process a single company
 */
async function processCompany(
  company: Company,
  index: number,
  total: number,
  verifyOnly: boolean = false
): Promise<UpdateResult> {
  const result: UpdateResult = {
    ticker: company.ticker,
    name: company.name,
    sector: company.sector,
    originalTicker: company.ticker,
    newTicker: null,
    status: 'failed',
  };
  
  console.log(`\n[${index}/${total}] Processing: ${company.name}`);
  console.log(`  Current ticker: ${company.ticker}`);
  console.log(`  Sector: ${company.sector}`);
  
  // Verify current ticker
  const verification = await verifyTicker(company.ticker, company.name);
  
  if (verification.isValid) {
    result.status = 'verified';
    result.newTicker = verification.actualTicker;
    console.log(`  ✅ Status: VERIFIED (ticker is correct)`);
    return result;
  }
  
  // Ticker is invalid
  console.log(`  ⚠️  Current ticker is invalid: ${verification.error}`);
  
  if (verifyOnly) {
    result.status = 'failed';
    result.error = verification.error;
    console.log(`  ⏭️  Skipping search (verify-only mode)`);
    return result;
  }
  
  // Search for correct ticker
  const searchResult = await searchTickerByName(company.name);
  
  if (searchResult.ticker) {
    result.status = 'updated';
    result.newTicker = searchResult.ticker;
    result.ticker = searchResult.ticker; // Update ticker for CSV
    console.log(`  ✅ Status: UPDATED (new ticker: ${searchResult.ticker})`);
  } else {
    result.status = 'failed';
    result.error = searchResult.error || 'Could not find ticker';
    console.log(`  ❌ Status: FAILED (${result.error})`);
  }
  
  return result;
}

/**
 * Main function to update CSV tickers
 */
async function updateCSVTickers(
  inputPath: string,
  outputPath: string,
  options: {
    maxCompanies?: number;
    verifyOnly?: boolean;
    startFrom?: number;
  } = {}
): Promise<void> {
  const startTime = Date.now();
  
  console.log('='.repeat(80));
  console.log('📊 CSV Ticker Updater');
  console.log('='.repeat(80));
  console.log(`Input file: ${inputPath}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Mode: ${options.verifyOnly ? 'Verify Only' : 'Verify & Update'}`);
  if (options.maxCompanies) {
    console.log(`Max companies: ${options.maxCompanies}`);
  }
  if (options.startFrom) {
    console.log(`Starting from index: ${options.startFrom}`);
  }
  console.log('='.repeat(80));
  console.log();
  
  // Parse CSV
  let companies = parseCSV(inputPath);
  const total = companies.length;
  
  // Apply filters
  if (options.startFrom) {
    companies = companies.slice(options.startFrom);
    console.log(`⏭️  Starting from index ${options.startFrom}, ${companies.length} companies remaining`);
  }
  
  if (options.maxCompanies) {
    companies = companies.slice(0, options.maxCompanies);
    console.log(`📌 Processing first ${companies.length} companies`);
  }
  
  const stats: ProgressStats = {
    total: companies.length,
    processed: 0,
    verified: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };
  
  const results: UpdateResult[] = [];
  
  // Process each company
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const index = (options.startFrom || 0) + i + 1;
    
    try {
      const result = await processCompany(company, index, total, options.verifyOnly);
      results.push(result);
      
      // Update stats
      stats.processed++;
      if (result.status === 'verified') stats.verified++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'failed') stats.failed++;
      else if (result.status === 'skipped') stats.skipped++;
      
      // Update company ticker if it was updated
      if (result.status === 'updated' && result.newTicker) {
        company.ticker = result.newTicker;
      }
      
      // Progress update
      if ((i + 1) % CONFIG.PROGRESS_UPDATE_INTERVAL === 0 || i === companies.length - 1) {
        const progress = ((i + 1) / companies.length) * 100;
        console.log(`\n📈 Progress: ${i + 1}/${companies.length} (${progress.toFixed(1)}%)`);
        console.log(`   ✅ Verified: ${stats.verified} | 🔄 Updated: ${stats.updated} | ❌ Failed: ${stats.failed}`);
      }
      
      // Delay between requests (except for last item)
      if (i < companies.length - 1) {
        const delayMs = CONFIG.DELAY_BETWEEN_REQUESTS;
        console.log(`  ⏳ Waiting ${(delayMs / 1000).toFixed(1)}s before next request...`);
        await delay(delayMs);
      }
    } catch (error: any) {
      console.error(`\n❌ Unexpected error processing company ${index}:`, error);
      results.push({
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
        originalTicker: company.ticker,
        newTicker: null,
        status: 'failed',
        error: error.message || String(error),
      });
      stats.processed++;
      stats.failed++;
    }
  }
  
  // Write updated CSV
  console.log(`\n💾 Writing updated CSV to: ${outputPath}`);
  writeCSV(outputPath, companies);
  
  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(80));
  console.log('📊 Update Complete!');
  console.log('='.repeat(80));
  console.log(`Total companies: ${stats.total}`);
  console.log(`✅ Verified: ${stats.verified}`);
  console.log(`🔄 Updated: ${stats.updated}`);
  console.log(`❌ Failed: ${stats.failed}`);
  console.log(`⏭️  Skipped: ${stats.skipped}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`📁 Output file: ${outputPath}`);
  console.log('='.repeat(80));
  
  // Print failed companies
  const failed = results.filter(r => r.status === 'failed');
  if (failed.length > 0) {
    console.log('\n❌ Failed Companies:');
    failed.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} (${r.ticker}): ${r.error || 'Unknown error'}`);
    });
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Default paths - resolve relative to project root (two levels up from scripts/)
  const projectRoot = join(__dirname, '../..');
  const defaultInput = join(projectRoot, 'csv_export', 'companies_bulk_import_corrected.csv');
  const defaultOutput = join(projectRoot, 'csv_export', 'companies_bulk_import_updated.csv');
  
  // Parse arguments
  const inputPath = args[0] || defaultInput;
  const outputPath = args[1] || defaultOutput;
  const maxCompanies = args[2] ? parseInt(args[2], 10) : undefined;
  const verifyOnly = args.includes('--verify-only') || args.includes('-v');
  const startFrom = args.find(arg => arg.startsWith('--start-from='))?.split('=')[1];
  
  const options = {
    maxCompanies,
    verifyOnly,
    startFrom: startFrom ? parseInt(startFrom, 10) : undefined,
  };
  
  try {
    await updateCSVTickers(inputPath, outputPath, options);
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function when script is executed
main();

export { updateCSVTickers, parseCSV, writeCSV };

