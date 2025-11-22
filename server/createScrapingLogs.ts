import { db } from "./db";
import { sql } from "drizzle-orm";

async function createScrapingLogs() {
  try {
    console.log("Checking scraping_logs table...");
    
    // Check if table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'scraping_logs'
      );
    `);
    
    const exists = (tableExists.rows[0] as any)?.exists;
    
    if (!exists) {
      console.log("Creating scraping_logs table...");
      await db.execute(sql`
        CREATE TABLE scraping_logs (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          ticker text NOT NULL,
          company_id varchar REFERENCES companies(id),
          sector_id varchar REFERENCES sectors(id),
          user_id varchar REFERENCES users(id),
          status text NOT NULL,
          quarters_scraped integer DEFAULT 0,
          metrics_scraped integer DEFAULT 0,
          error text,
          started_at timestamp NOT NULL DEFAULT NOW(),
          completed_at timestamp,
          created_at timestamp NOT NULL DEFAULT NOW()
        );
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_scraping_logs_ticker ON scraping_logs(ticker);
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_scraping_logs_company_id ON scraping_logs(company_id);
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_scraping_logs_sector_id ON scraping_logs(sector_id);
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_scraping_logs_status ON scraping_logs(status);
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_scraping_logs_user_id ON scraping_logs(user_id);
      `);
      
      console.log("✓ scraping_logs table created successfully");
    } else {
      console.log("✓ scraping_logs table already exists");
      
      // Check if user_id column exists, if not add it
      const columnExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'scraping_logs' 
          AND column_name = 'user_id'
        );
      `);
      
      const hasUserId = (columnExists.rows[0] as any)?.exists;
      
      if (!hasUserId) {
        console.log("Adding user_id column to existing table...");
        await db.execute(sql`
          ALTER TABLE scraping_logs 
          ADD COLUMN user_id varchar REFERENCES users(id);
        `);
        
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_scraping_logs_user_id ON scraping_logs(user_id);
        `);
        
        console.log("✓ user_id column added successfully");
      } else {
        console.log("✓ user_id column already exists");
      }
    }
    
    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

createScrapingLogs();

