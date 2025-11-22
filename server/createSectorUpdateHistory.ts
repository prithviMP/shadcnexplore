/**
 * Create sector_update_history table
 * Run this script to create the table in your database
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

async function createSectorUpdateHistoryTable() {
  try {
    console.log("Creating sector_update_history table...");

    // Check if table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sector_update_history'
      );
    `);

    const exists = (tableExists.rows[0] as any)?.exists;

    if (exists) {
      console.log("✓ sector_update_history table already exists");
    } else {
      // Create table
      await db.execute(sql`
        CREATE TABLE sector_update_history (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id varchar NOT NULL REFERENCES users(id),
          status text NOT NULL,
          progress integer DEFAULT 0,
          total_sectors integer NOT NULL,
          completed_sectors integer DEFAULT 0,
          successful_sectors integer DEFAULT 0,
          failed_sectors integer DEFAULT 0,
          sector_results jsonb DEFAULT '[]'::jsonb,
          error text,
          started_at timestamp NOT NULL DEFAULT NOW(),
          completed_at timestamp,
          created_at timestamp NOT NULL DEFAULT NOW()
        );
      `);

      // Create indexes
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_sector_update_history_user_id 
        ON sector_update_history(user_id);
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_sector_update_history_started_at 
        ON sector_update_history(started_at DESC);
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_sector_update_history_status 
        ON sector_update_history(status);
      `);

      console.log("✓ sector_update_history table created successfully");
    }
  } catch (error: any) {
    console.error("Error creating sector_update_history table:", error);
    throw error;
  }
}

// Run if called directly
createSectorUpdateHistoryTable()
  .then(() => {
    console.log("Migration completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });

export { createSectorUpdateHistoryTable };

