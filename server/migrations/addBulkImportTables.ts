/**
 * Migration: Add Bulk Import Tables
 * 
 * Run with: npx tsx server/migrations/addBulkImportTables.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Adding bulk import tables...');

    // Create bulk_import_jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bulk_import_jobs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        file_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total_items INTEGER NOT NULL DEFAULT 0,
        processed_items INTEGER NOT NULL DEFAULT 0,
        success_items INTEGER NOT NULL DEFAULT 0,
        failed_items INTEGER NOT NULL DEFAULT 0,
        skipped_items INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Created bulk_import_jobs table');

    // Create bulk_import_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bulk_import_items (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id VARCHAR NOT NULL REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
        ticker TEXT NOT NULL,
        company_name TEXT NOT NULL,
        sector_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        resolved_ticker TEXT,
        sector_id VARCHAR REFERENCES sectors(id),
        company_id VARCHAR REFERENCES companies(id),
        error TEXT,
        quarters_scraped INTEGER DEFAULT 0,
        metrics_scraped INTEGER DEFAULT 0,
        processed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Created bulk_import_items table');

    // Add indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bulk_import_items_job_id ON bulk_import_items(job_id);
      CREATE INDEX IF NOT EXISTS idx_bulk_import_items_status ON bulk_import_items(status);
      CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_status ON bulk_import_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_user_id ON bulk_import_jobs(user_id);
    `);
    console.log('✓ Created indexes');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

