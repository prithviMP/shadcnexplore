/**
 * Add dummy quarterly data for a company for December 2025 to test sliding window logic
 * 
 * This script:
 * 1. Adds December 2025 data for a specified company (or all companies if no ticker provided)
 * 2. Shows how the sliding window of 12 quarters works
 * 3. Demonstrates that Q12 will map to the newest quarter after insertion
 * 
 * Usage:
 *   npx tsx server/migrations/addDec2025DataForCompany.ts [TICKER]
 * 
 * Example:
 *   npx tsx server/migrations/addDec2025DataForCompany.ts TCS
 *   npx tsx server/migrations/addDec2025DataForCompany.ts  # Adds for all companies
 */

import "dotenv/config";
import { db } from "../db";
import { companies, quarterlyData } from "@shared/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import type { InsertQuarterlyData } from "@shared/schema";

const DEC_2025_QUARTER = "Dec 2025";

interface QuarterInfo {
  quarter: string;
  quarterIndex: string; // Q1, Q2, ... Q12
  arrayIndex: number;
  isInWindow: boolean;
}

/**
 * Get company's quarterly data and show sliding window analysis
 */
async function analyzeQuarterlyData(ticker: string, companyId: string) {
  const allQuarters = await db
    .select({ quarter: quarterlyData.quarter })
    .from(quarterlyData)
    .where(eq(quarterlyData.ticker, ticker))
    .groupBy(quarterlyData.quarter)
    .orderBy(desc(quarterlyData.quarter));

  const uniqueQuarters = allQuarters.map(q => q.quarter);
  
  // Sort quarters newest first (same logic as formulaEvaluator)
  const sortedQuarters = uniqueQuarters.sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return dateB.getTime() - dateA.getTime(); // Descending (Newest first)
    }
    return b.localeCompare(a);
  });

  // Get the 12-quarter window (newest 12)
  const quartersToUse = sortedQuarters.length > 12 
    ? sortedQuarters.slice(0, 12)
    : sortedQuarters;

  console.log(`\n📊 Quarterly Data Analysis for ${ticker}:`);
  console.log(`   Total quarters in database: ${sortedQuarters.length}`);
  console.log(`   Quarters in 12-quarter window: ${quartersToUse.length}`);
  
  if (sortedQuarters.length > 12) {
    const droppedQuarters = sortedQuarters.slice(12);
    console.log(`   ⚠️  Dropped quarters (older than window): ${droppedQuarters.join(', ')}`);
  }

  console.log(`\n   Sliding Window (Newest → Oldest):`);
  quartersToUse.forEach((quarter, index) => {
    const qNum = quartersToUse.length - index; // Q12, Q11, ..., Q1
    const marker = index === 0 ? ' ← Q12 (NEWEST)' : '';
    console.log(`   [${qNum.toString().padStart(2, ' ')}] ${quarter}${marker}`);
  });

  if (sortedQuarters.length > quartersToUse.length) {
    console.log(`\n   Quarters outside window (older):`);
    sortedQuarters.slice(quartersToUse.length).forEach((quarter, index) => {
      console.log(`   [--] ${quarter}`);
    });
  }

  return {
    sortedQuarters,
    quartersToUse,
    hasDec2025: sortedQuarters.includes(DEC_2025_QUARTER)
  };
}

/**
 * Add December 2025 data for a company
 */
async function addDec2025DataForCompany(ticker: string) {
  try {
    console.log(`\n🔍 Processing ${ticker}...`);

    // Find company
    const companyResults = await db
      .select()
      .from(companies)
      .where(eq(companies.ticker, ticker))
      .limit(1);

    if (companyResults.length === 0) {
      console.error(`❌ Company ${ticker} not found in database.`);
      return;
    }

    const company = companyResults[0];
    console.log(`✅ Found: ${company.name} (ID: ${company.id})`);

    // Analyze current quarterly data
    const analysis = await analyzeQuarterlyData(ticker, company.id);

    // Check if Dec 2025 already exists
    if (analysis.hasDec2025) {
      console.log(`\n⚠️  December 2025 data already exists for ${ticker}. Skipping insertion.`);
      console.log(`\n💡 To see how it affects the sliding window, check the analysis above.`);
      return;
    }

    // Get the most recent quarter's data to use as a template
    const existingData = await db
      .select()
      .from(quarterlyData)
      .where(eq(quarterlyData.ticker, ticker))
      .orderBy(desc(quarterlyData.quarter))
      .limit(200);

    if (existingData.length === 0) {
      console.error(`❌ No existing quarterly data found for ${ticker}. Cannot create dummy data template.`);
      return;
    }

    // Find the most recent quarter
    const quarters = new Set(existingData.map(d => d.quarter));
    const sortedQuarters = Array.from(quarters).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime();
      }
      return b.localeCompare(a);
    });
    const mostRecentQuarter = sortedQuarters[0];

    // Get all unique metrics from the most recent quarter
    const recentMetrics = existingData
      .filter(d => d.quarter === mostRecentQuarter)
      .map(d => d.metricName);
    const uniqueMetrics = Array.from(new Set(recentMetrics));

    // Get metric values from the most recent quarter to use as a base
    const recentMetricValues = new Map<string, string | null>();
    existingData
      .filter(d => d.quarter === mostRecentQuarter)
      .forEach(d => {
        if (!recentMetricValues.has(d.metricName)) {
          recentMetricValues.set(d.metricName, d.metricValue);
        }
      });

    console.log(`\n📅 Most recent quarter: ${mostRecentQuarter}`);
    console.log(`📈 Found ${uniqueMetrics.length} unique metrics`);

    // Create dummy data for Dec 2025
    // Apply a small variation (+5-10%) to make it realistic
    const dummyData: InsertQuarterlyData[] = uniqueMetrics.map(metricName => {
      const baseValue = recentMetricValues.get(metricName);
      
      let newValue: string | null = baseValue;
      if (baseValue && !isNaN(parseFloat(baseValue))) {
        const numValue = parseFloat(baseValue);
        // Apply 5-10% increase for dummy data
        const variation = 1 + (5 + Math.random() * 5) / 100; // 1.05 to 1.10
        const adjustedValue = (numValue * variation).toFixed(4);
        newValue = adjustedValue;
      }

      return {
        ticker: ticker,
        companyId: company.id,
        quarter: DEC_2025_QUARTER,
        metricName: metricName,
        metricValue: newValue,
        scrapeTimestamp: null,
      };
    });

    console.log(`\n📝 Inserting ${dummyData.length} metric records for ${DEC_2025_QUARTER}...`);

    // Insert the dummy data (using ON CONFLICT to handle duplicates)
    const result = await db
      .insert(quarterlyData)
      .values(dummyData)
      .onConflictDoUpdate({
        target: [quarterlyData.ticker, quarterlyData.quarter, quarterlyData.metricName, quarterlyData.scrapeTimestamp],
        set: {
          metricValue: sql`EXCLUDED.metric_value`,
          companyId: sql`EXCLUDED.company_id`,
        }
      })
      .returning();

    console.log(`✅ Successfully inserted ${result.length} records for ${ticker} - ${DEC_2025_QUARTER}`);

    // Show analysis after insertion
    console.log(`\n📊 Analysis AFTER inserting ${DEC_2025_QUARTER}:`);
    await analyzeQuarterlyData(ticker, company.id);

    console.log(`\n💡 Key Points:`);
    console.log(`   • After insertion, "${DEC_2025_QUARTER}" will be the NEWEST quarter`);
    console.log(`   • In the 12-quarter sliding window, it will be Q12 (index 0)`);
    console.log(`   • The oldest quarter in the window will drop off if there were already 12+ quarters`);
    console.log(`   • Formula evaluation will automatically use this new data`);
    console.log(`   • The sliding window always contains the most recent 12 quarters\n`);

  } catch (error) {
    console.error(`❌ Error processing ${ticker}:`, error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const tickerArg = process.argv[2];

    if (tickerArg) {
      // Add data for specific company
      await addDec2025DataForCompany(tickerArg.toUpperCase());
    } else {
      // Add data for all companies
      console.log("📋 Adding December 2025 data for ALL companies...\n");
      
      const allCompanies = await db
        .select()
        .from(companies)
        .orderBy(companies.ticker);

      console.log(`Found ${allCompanies.length} companies\n`);

      for (const company of allCompanies) {
        await addDec2025DataForCompany(company.ticker);
        console.log("\n" + "=".repeat(60) + "\n");
      }

      console.log(`\n✅ Completed processing all companies!`);
    }

  } catch (error) {
    console.error("\n❌ Script failed:", error);
    throw error;
  }
}

main()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
