/**
 * Migration: Add updatedAt column to signals table
 * 
 * Run with: npx tsx server/migrations/addUpdatedAtToSignals.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Adding updated_at column to signals table...');

    // Check if column already exists
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'signals' AND column_name = 'updated_at';
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ updated_at column already exists, skipping migration');
      return;
    }

    // Add updated_at column
    await pool.query(`
      ALTER TABLE signals 
      ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    `);
    console.log('✓ Added updated_at column');

    // Set initial updated_at = created_at for existing signals
    await pool.query(`
      UPDATE signals 
      SET updated_at = created_at 
      WHERE updated_at IS NULL OR updated_at < created_at;
    `);
    console.log('✓ Set initial updated_at values');

    // Create index on (company_id, updated_at) for efficient stale signal queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_signals_company_updated 
      ON signals(company_id, updated_at);
    `);
    console.log('✓ Created index on (company_id, updated_at)');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);















