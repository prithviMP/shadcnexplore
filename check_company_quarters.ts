/**
 * Check quarterly data for a specific company
 * Usage: npx tsx check_company_quarters.ts <companyId>
 */

import "dotenv/config";
import { db } from "./server/db";
import { companies, quarterlyData } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

async function checkCompanyQuarters(companyId: string) {
  try {
    // Find company
    const companyResults = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (companyResults.length === 0) {
      console.error(`❌ Company with ID ${companyId} not found`);
      process.exit(1);
    }

    const company = companyResults[0];
    console.log(`\n✅ Found company: ${company.name} (Ticker: ${company.ticker})\n`);

    // Get all quarterly data for this company
    const allData = await db
      .select()
      .from(quarterlyData)
      .where(eq(quarterlyData.ticker, company.ticker))
      .orderBy(desc(quarterlyData.quarter));

    // Get unique quarters
    const uniqueQuarters = Array.from(new Set(allData.map(d => d.quarter)));
    
    // Sort quarters newest first
    const sortedQuarters = uniqueQuarters.sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime(); // Descending (Newest first)
      }
      return b.localeCompare(a);
    });

    console.log(`📊 Quarterly Data Summary:`);
    console.log(`   Total quarters in database: ${sortedQuarters.length}`);
    console.log(`   Ticker: ${company.ticker}`);
    console.log(`\n   All quarters (newest first):`);
    sortedQuarters.forEach((quarter, index) => {
      const quarterData = allData.filter(d => d.quarter === quarter);
      const uniqueMetrics = new Set(quarterData.map(d => d.metricName));
      console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${quarter} (${uniqueMetrics.size} metrics)`);
    });

    if (sortedQuarters.length === 0) {
      console.log(`\n⚠️  No quarterly data found for ${company.ticker}`);
      console.log(`\n💡 You may need to scrape this company first.`);
    } else if (sortedQuarters.length === 1) {
      console.log(`\n⚠️  Only 1 quarter found. You may need to scrape more data.`);
    } else {
      console.log(`\n✅ Multiple quarters available. The UI should show all of them.`);
      console.log(`   Expected quarters in UI: ${sortedQuarters.length > 12 ? 12 : sortedQuarters.length} (last 12 or all)`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  }
}

const companyId = process.argv[2];
if (!companyId) {
  console.error("Usage: npx tsx check_company_quarters.ts <companyId>");
  process.exit(1);
}

checkCompanyQuarters(companyId)
  .then(() => {
    console.log("\n✅ Check completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Check failed:", error);
    process.exit(1);
  });
