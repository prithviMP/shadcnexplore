/**
 * Script to clean up duplicate signals - keep only the latest signal per company
 * This ensures each company has only one signal (the most recent one)
 */

import "dotenv/config";
import { db } from "./db";
import { signals } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

async function cleanupDuplicateSignals() {
  console.log("=".repeat(80));
  console.log("CLEANING UP DUPLICATE SIGNALS");
  console.log("=".repeat(80));
  console.log();

  try {
    // Count total signals before cleanup
    const beforeCount = await db.select({ count: sql<number>`count(*)` }).from(signals);
    const totalBefore = Number(beforeCount[0]?.count || 0);
    console.log(`Total signals before cleanup: ${totalBefore}`);

    // Delete all signals except the latest one for each company
    // Using a subquery to find signals that are NOT the latest for their company
    // We need to use raw SQL with the actual table name
    const deleteResult = await db.execute(sql`
      DELETE FROM signals
      WHERE id NOT IN (
        SELECT DISTINCT ON (company_id) id
        FROM signals
        ORDER BY company_id, updated_at DESC, created_at DESC
      )
    `);

    // Count total signals after cleanup
    const afterCount = await db.select({ count: sql<number>`count(*)` }).from(signals);
    const totalAfter = Number(afterCount[0]?.count || 0);
    const deleted = totalBefore - totalAfter;

    console.log(`Total signals after cleanup: ${totalAfter}`);
    console.log(`Signals deleted: ${deleted}`);
    console.log();
    console.log("=".repeat(80));
    console.log("✓ CLEANUP COMPLETE");
    console.log(`  Removed ${deleted} duplicate signals`);
    console.log(`  Each company now has at most 1 signal`);
    console.log("=".repeat(80));

  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the cleanup
cleanupDuplicateSignals();
