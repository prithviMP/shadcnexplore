import { db } from "./db";
import { sql } from "drizzle-orm";

async function fixSectorMappings() {
  try {
    console.log("Checking sector_mappings table...");
    
    // Check if table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sector_mappings'
      );
    `);
    
    const exists = (tableExists.rows[0] as any)?.exists;
    
    if (!exists) {
      console.log("Creating sector_mappings table...");
      await db.execute(sql`
        CREATE TABLE sector_mappings (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          screener_sector text NOT NULL,
          custom_sector_id varchar NOT NULL REFERENCES sectors(id),
          created_at timestamp NOT NULL DEFAULT NOW(),
          updated_at timestamp NOT NULL DEFAULT NOW(),
          UNIQUE(screener_sector, custom_sector_id)
        );
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_sector_mappings_screener_sector ON sector_mappings(screener_sector);
      `);
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_sector_mappings_custom_sector_id ON sector_mappings(custom_sector_id);
      `);
      
      console.log("✓ sector_mappings table created successfully");
    } else {
      console.log("sector_mappings table already exists, checking columns...");
      
      // Check if custom_sector_id column exists
      const columnCheck = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sector_mappings' 
        AND column_name IN ('custom_sector_id', 'custom_sector');
      `);
      
      const columns = columnCheck.rows.map((r: any) => r.column_name);
      
      if (columns.includes('custom_sector') && !columns.includes('custom_sector_id')) {
        console.log("Renaming custom_sector to custom_sector_id...");
        await db.execute(sql`
          ALTER TABLE sector_mappings 
          RENAME COLUMN custom_sector TO custom_sector_id;
        `);
        
        await db.execute(sql`
          ALTER TABLE sector_mappings 
          ALTER COLUMN custom_sector_id TYPE varchar;
        `);
        
        await db.execute(sql`
          ALTER TABLE sector_mappings 
          ALTER COLUMN custom_sector_id SET NOT NULL;
        `);
        
        console.log("✓ Column renamed successfully");
      } else if (!columns.includes('custom_sector_id')) {
        console.log("Adding custom_sector_id column...");
        await db.execute(sql`
          ALTER TABLE sector_mappings 
          ADD COLUMN custom_sector_id varchar NOT NULL REFERENCES sectors(id);
        `);
        console.log("✓ Column added successfully");
      } else {
        console.log("✓ custom_sector_id column already exists");
      }
      
      // Check if updated_at exists
      const updatedAtCheck = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sector_mappings' 
        AND column_name = 'updated_at';
      `);
      
      if (updatedAtCheck.rows.length === 0) {
        console.log("Adding updated_at column...");
        await db.execute(sql`
          ALTER TABLE sector_mappings 
          ADD COLUMN updated_at timestamp NOT NULL DEFAULT NOW();
        `);
        console.log("✓ updated_at column added");
      } else {
        console.log("✓ updated_at column already exists");
      }
    }
    
    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

fixSectorMappings();

