import { db } from "./db";
import { sql } from "drizzle-orm";

async function addUserIdToScrapingLogs() {
  try {
    console.log("Adding user_id column to scraping_logs table...");
    
    // Check if column already exists
    const columnExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'scraping_logs' 
        AND column_name = 'user_id'
      );
    `);
    
    const exists = (columnExists.rows[0] as any)?.exists;
    
    if (!exists) {
      console.log("Adding user_id column...");
      
      // Add the column (nullable initially for existing records)
      await db.execute(sql`
        ALTER TABLE scraping_logs 
        ADD COLUMN user_id varchar REFERENCES users(id);
      `);
      
      // Create index for better query performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_scraping_logs_user_id ON scraping_logs(user_id);
      `);
      
      console.log("✓ user_id column added successfully");
    } else {
      console.log("✓ user_id column already exists");
    }
    
    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

addUserIdToScrapingLogs();

