/**
 * Migration: Add sector_schedules table for sector-specific scheduling
 * 
 * Run with: npx tsx server/migrations/addSectorSchedulesTable.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Creating sector_schedules table...');

    // Check if table already exists
    const checkResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'sector_schedules';
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ sector_schedules table already exists, skipping migration');
      return;
    }

    // Create sector_schedules table
    await pool.query(`
      CREATE TABLE sector_schedules (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        sector_id VARCHAR NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
        schedule TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Created sector_schedules table');

    // Create index on sector_id for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sector_schedules_sector_id 
      ON sector_schedules(sector_id);
    `);
    console.log('✓ Created index on sector_id');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

