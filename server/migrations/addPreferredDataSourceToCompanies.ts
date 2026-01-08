/**
 * Migration: Add preferredDataSource column to companies table
 * 
 * This column stores the user's preferred data source (consolidated/standalone)
 * for each company's quarterly data. This ensures the preference is remembered
 * when scraping sectors or refreshing data.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Starting migration: Add preferredDataSource column to companies table...");
  
  try {
    // Check if column already exists
    const checkQuery = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'companies' 
      AND column_name = 'preferred_data_source'
    `);
    
    if (checkQuery.rows && checkQuery.rows.length > 0) {
      console.log("Column 'preferred_data_source' already exists in companies table. Skipping migration.");
      return;
    }
    
    // Add the column with default value 'consolidated'
    await db.execute(sql`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS preferred_data_source TEXT DEFAULT 'consolidated'
    `);
    
    console.log("✅ Successfully added 'preferred_data_source' column to companies table");
    console.log("   Default value: 'consolidated'");
    console.log("   This column stores user's preferred data source (consolidated/standalone)");
    
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  }
}

// Run migration
migrate()
  .then(() => {
    console.log("Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });

