/**
 * Script to check signal counts and identify duplicates
 */

import "dotenv/config";
import { db } from "./db";
import { signals, companies } from "@shared/schema";
import { sql } from "drizzle-orm";

async function checkSignalCount() {
  console.log("=".repeat(80));
  console.log("CHECKING SIGNAL COUNTS");
  console.log("=".repeat(80));
  console.log();

  try {
    // Count total signals
    const totalSignals = await db.select({ count: sql<number>`count(*)` }).from(signals);
    console.log(`Total signals in database: ${Number(totalSignals[0]?.count || 0)}`);

    // Count total companies
    const totalCompanies = await db.select({ count: sql<number>`count(*)` }).from(companies);
    console.log(`Total companies: ${Number(totalCompanies[0]?.count || 0)}`);

    // Count companies with signals
    const companiesWithSignals = await db.execute(sql`
      SELECT COUNT(DISTINCT company_id) as count
      FROM signals
    `);
    console.log(`Companies with signals: ${(companiesWithSignals.rows[0] as any)?.count || 0}`);

    // Count companies with multiple signals
    const companiesWithMultipleSignals = await db.execute(sql`
      SELECT company_id, COUNT(*) as count
      FROM signals
      GROUP BY company_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    const multiSignalCount = companiesWithMultipleSignals.rows.length;
    console.log(`Companies with multiple signals: ${multiSignalCount}`);
    
    if (multiSignalCount > 0) {
      console.log("\nCompanies with multiple signals:");
      (companiesWithMultipleSignals.rows as any[]).slice(0, 10).forEach(row => {
        console.log(`  Company ID: ${row.company_id}, Signals: ${row.count}`);
      });
      if (multiSignalCount > 10) {
        console.log(`  ... and ${multiSignalCount - 10} more`);
      }
    }

    // Count latest signals per company (should match companies with signals)
    const latestSignals = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM (
        SELECT DISTINCT ON (company_id) id
        FROM signals
        ORDER BY company_id, updated_at DESC, created_at DESC
      ) latest
    `);
    console.log(`Latest signals per company: ${(latestSignals.rows[0] as any)?.count || 0}`);

    console.log();
    console.log("=".repeat(80));

  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkSignalCount();
