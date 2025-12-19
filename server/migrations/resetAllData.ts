/**
 * Reset all data: Delete all companies, sectors, and related data
 * 
 * This script will delete:
 * - All signals
 * - All quarterly data
 * - All companies
 * - All sectors
 * - Custom tables
 * - Scraping logs
 * - Sector update history
 * 
 * WARNING: This is a destructive operation and cannot be undone!
 * 
 * Run with: npx tsx server/migrations/resetAllData.ts
 */

import "dotenv/config";
import { db } from "../db";
import { 
  signals, 
  quarterlyData, 
  companies, 
  sectors, 
  customTables,
  scrapingLogs,
  sectorUpdateHistory,
  sectorMappings,
  bulkImportItems,
  bulkImportJobs,
} from "@shared/schema";

async function resetAllData() {
  try {
    console.log("⚠️  WARNING: This will delete ALL companies, sectors, and related data!\n");
    console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");
    
    // Give user 5 seconds to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("Starting data reset...\n");

    // Delete in order to respect foreign key constraints
    
    // 1. Delete signals (depends on companies)
    console.log("🗑️  Deleting all signals...");
    const signalsDeleted = await db.delete(signals);
    console.log(`   ✓ Deleted signals\n`);

    // 2. Delete quarterly data (depends on companies)
    console.log("🗑️  Deleting all quarterly data...");
    const quarterlyDeleted = await db.delete(quarterlyData);
    console.log(`   ✓ Deleted quarterly data\n`);

    // 3. Delete scraping logs (depends on companies and sectors)
    console.log("🗑️  Deleting all scraping logs...");
    const logsDeleted = await db.delete(scrapingLogs);
    console.log(`   ✓ Deleted scraping logs\n`);

    // 4. Delete sector update history (depends on sectors)
    console.log("🗑️  Deleting all sector update history...");
    const historyDeleted = await db.delete(sectorUpdateHistory);
    console.log(`   ✓ Deleted sector update history\n`);

    // 5. Delete bulk import items (depends on companies and sectors)
    console.log("🗑️  Deleting all bulk import items...");
    const bulkItemsDeleted = await db.delete(bulkImportItems);
    console.log(`   ✓ Deleted bulk import items\n`);

    // 6. Delete bulk import jobs
    console.log("🗑️  Deleting all bulk import jobs...");
    const bulkJobsDeleted = await db.delete(bulkImportJobs);
    console.log(`   ✓ Deleted bulk import jobs\n`);

    // 7. Delete sector mappings (depends on sectors)
    console.log("🗑️  Deleting all sector mappings...");
    const mappingsDeleted = await db.delete(sectorMappings);
    console.log(`   ✓ Deleted sector mappings\n`);

    // 8. Delete custom tables (depends on sectors)
    console.log("🗑️  Deleting all custom tables...");
    const customTablesDeleted = await db.delete(customTables);
    console.log(`   ✓ Deleted custom tables\n`);

    // 9. Delete companies (depends on sectors)
    console.log("🗑️  Deleting all companies...");
    const companiesDeleted = await db.delete(companies);
    console.log(`   ✓ Deleted companies\n`);

    // 10. Delete sectors (no dependencies after companies are deleted)
    console.log("🗑️  Deleting all sectors...");
    const sectorsDeleted = await db.delete(sectors);
    console.log(`   ✓ Deleted sectors\n`);

    console.log("✅ All data reset completed successfully!\n");
    console.log("The following have been deleted:");
    console.log("  - All signals");
    console.log("  - All quarterly data");
    console.log("  - All scraping logs");
    console.log("  - All sector update history");
    console.log("  - All bulk import items");
    console.log("  - All bulk import jobs");
    console.log("  - All sector mappings");
    console.log("  - All custom tables");
    console.log("  - All companies");
    console.log("  - All sectors\n");
    
    console.log("Note: Users, roles, formulas, and queries are NOT deleted.");
    console.log("Only company and sector-related data has been reset.\n");

  } catch (error) {
    console.error("❌ Error resetting data:", error);
    throw error;
  }
}

resetAllData()
  .then(() => {
    console.log("✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
