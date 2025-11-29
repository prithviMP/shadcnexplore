import { db } from "./db";
import { sql } from "drizzle-orm";

async function addEnabledColumnToUsers() {
  try {
    console.log("🔄 Adding 'enabled' column to users table...");

    // Check if column already exists
    const checkColumn = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'enabled'
    `);

    if (checkColumn.rows.length > 0) {
      console.log("✅ 'enabled' column already exists in users table");
      return;
    }

    // Add the enabled column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true
    `);

    console.log("✅ Successfully added 'enabled' column to users table");
  } catch (error: any) {
    console.error("❌ Error adding 'enabled' column:", error.message);
    throw error;
  } finally {
    process.exit(0);
  }
}

addEnabledColumnToUsers();

