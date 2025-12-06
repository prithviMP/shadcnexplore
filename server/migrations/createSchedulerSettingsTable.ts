/**
 * Migration: Create scheduler_settings table
 * 
 * Run with: npx tsx server/migrations/createSchedulerSettingsTable.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Creating scheduler_settings table...');

    // Check if table already exists
    const checkResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'scheduler_settings';
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ scheduler_settings table already exists, skipping migration');
      return;
    }

    // Create scheduler_settings table
    await pool.query(`
      CREATE TABLE scheduler_settings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type TEXT NOT NULL UNIQUE,
        schedule TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Created scheduler_settings table');

    // Create index on job_type for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduler_settings_job_type 
      ON scheduler_settings(job_type);
    `);
    console.log('✓ Created index on job_type');

    // Insert default scheduler settings
    await pool.query(`
      INSERT INTO scheduler_settings (job_type, schedule, enabled, description)
      VALUES 
        ('daily-scraping', '0 6 * * *', true, 'Daily scraping for all sectors'),
        ('signal-incremental', '0 2 * * *', true, 'Daily incremental signal refresh'),
        ('signal-full', '0 3 * * 0', true, 'Weekly full signal refresh (Sundays)')
      ON CONFLICT (job_type) DO NOTHING;
    `);
    console.log('✓ Inserted default scheduler settings');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

