import "dotenv/config";
import { db } from "./db";
import { sql } from "drizzle-orm";

async function updateCompaniesSchema() {
  console.log("🔄 Updating companies table schema to allow same ticker in different sectors...");

  try {
    // Check if the unique constraint on ticker exists
    const tickerConstraintCheck = await db.execute(sql`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'companies' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%ticker%'
    `);

    // Remove unique constraint on ticker if it exists
    if (tickerConstraintCheck.rows.length > 0) {
      const constraintName = tickerConstraintCheck.rows[0].constraint_name;
      console.log(`📝 Removing unique constraint on ticker: ${constraintName}`);
      await db.execute(sql.raw(`ALTER TABLE companies DROP CONSTRAINT IF EXISTS ${constraintName}`));
      console.log("✅ Removed unique constraint on ticker");
    } else {
      console.log("ℹ️  No unique constraint on ticker found");
    }

    // Check if the unique constraint on (ticker, sector_id) already exists
    const tickerSectorConstraintCheck = await db.execute(sql`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'companies' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%ticker%sector%'
    `);

    // Add unique constraint on (ticker, sector_id) if it doesn't exist
    if (tickerSectorConstraintCheck.rows.length === 0) {
      console.log("📝 Adding unique constraint on (ticker, sector_id)");
      await db.execute(sql`
        ALTER TABLE companies 
        ADD CONSTRAINT companies_ticker_sector_id_unique 
        UNIQUE (ticker, sector_id)
      `);
      console.log("✅ Added unique constraint on (ticker, sector_id)");
    } else {
      console.log("ℹ️  Unique constraint on (ticker, sector_id) already exists");
    }

    console.log("\n🎉 Companies table schema updated successfully!");
    console.log("✅ Companies can now exist in multiple sectors with the same ticker");
  } catch (error: any) {
    console.error("❌ Error updating companies schema:", error.message);
    throw error;
  }
}

updateCompaniesSchema()
  .catch(console.error)
  .finally(() => process.exit());

