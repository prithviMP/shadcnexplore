/**
 * Add dummy quarterly data for WIPRO for December 2025 to test sliding window logic
 * 
 * Run with: npx tsx server/migrations/addDummyDec2025ToTCS.ts
 */

import "dotenv/config";
import { db } from "../db";
import { companies, quarterlyData } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { InsertQuarterlyData } from "@shared/schema";

async function addDummyDataToWIPRO() {
  try {
    console.log("🔍 Finding WIPRO company...\n");

    // Find WIPRO company
    const wiproCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.ticker, "WIPRO"))
      .limit(1);

    if (wiproCompanies.length === 0) {
      console.error("❌ WIPRO company not found in database. Please ensure WIPRO exists.");
      process.exit(1);
    }

    const wipro = wiproCompanies[0];
    console.log(`✅ Found WIPRO: ${wipro.name} (ID: ${wipro.id})\n`);

    // Get the most recent quarter's data for WIPRO to use as a template
    console.log("📊 Fetching most recent quarterly data for WIPRO...\n");
    const existingData = await db
      .select()
      .from(quarterlyData)
      .where(eq(quarterlyData.ticker, "WIPRO"))
      .orderBy(desc(quarterlyData.quarter))
      .limit(100); // Get recent data to see what metrics exist

    if (existingData.length === 0) {
      console.error("❌ No existing quarterly data found for WIPRO. Cannot create dummy data template.");
      process.exit(1);
    }

    // Group by quarter to find unique metrics from the most recent quarter
    const quarters = new Set(existingData.map(d => d.quarter));
    const sortedQuarters = Array.from(quarters).sort().reverse();
    const mostRecentQuarter = sortedQuarters[0];
    
    console.log(`📅 Most recent quarter found: ${mostRecentQuarter}\n`);

    // Get all metrics from the most recent quarter
    const recentMetrics = existingData
      .filter(d => d.quarter === mostRecentQuarter)
      .map(d => d.metricName);

    const uniqueMetrics = Array.from(new Set(recentMetrics));
    console.log(`📈 Found ${uniqueMetrics.length} unique metrics in most recent quarter\n`);

    // Get metric values from the most recent quarter to use as a base
    const recentMetricValues = new Map<string, string | null>();
    existingData
      .filter(d => d.quarter === mostRecentQuarter)
      .forEach(d => {
        if (!recentMetricValues.has(d.metricName)) {
          recentMetricValues.set(d.metricName, d.metricValue);
        }
      });

    // Create dummy data for Dec 2025
    // We'll use the same metric values but slightly adjust them (+5-10% variation)
    // Quarter format should match the scraper format: "Dec 2025" (not "2025-12-31")
    const dec2025Quarter = "Dec 2025";
    // Use the same scrapeTimestamp format as existing data (or null if none exists)
    // For ON CONFLICT to work properly, we should use null if we want to match any scrapeTimestamp
    // Or use a specific Date object if we want a unique entry
    const scrapeTimestamp: Date | null = null; // Use null to allow matching any timestamp in ON CONFLICT

    console.log(`🔄 Creating dummy data for ${dec2025Quarter}...\n`);

    const dummyData: InsertQuarterlyData[] = uniqueMetrics.map(metricName => {
      const baseValue = recentMetricValues.get(metricName);
      
      // If base value exists and is numeric, apply a small variation (+5-10%)
      let newValue: string | null = baseValue;
      if (baseValue && !isNaN(parseFloat(baseValue))) {
        const numValue = parseFloat(baseValue);
        // Apply 5-10% increase for dummy data
        const variation = 1 + (5 + Math.random() * 5) / 100; // 1.05 to 1.10
        const adjustedValue = (numValue * variation).toFixed(4);
        newValue = adjustedValue;
      }

      return {
        ticker: "WIPRO",
        companyId: wipro.id,
        quarter: dec2025Quarter,
        metricName: metricName,
        metricValue: newValue,
        scrapeTimestamp: scrapeTimestamp || null, // Use null if timestamp is not set
      };
    });

    console.log(`📝 Inserting ${dummyData.length} metric records for ${dec2025Quarter}...\n`);

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

    console.log(`✅ Successfully inserted ${result.length} records for WIPRO - ${dec2025Quarter}\n`);
    console.log("📋 Sample metrics added:");
    result.slice(0, 10).forEach(r => {
      console.log(`   - ${r.metricName}: ${r.metricValue || 'null'}`);
    });
    if (result.length > 10) {
      console.log(`   ... and ${result.length - 10} more metrics\n`);
    }

    console.log("\n✅ Dummy data added successfully! You can now test the sliding window logic.");
  } catch (error) {
    console.error("❌ Error adding dummy data:", error);
    throw error;
  }
}

addDummyDataToWIPRO()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });

