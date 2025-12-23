/**
 * Migration: Add enabled column to formulas table
 * 
 * This adds the enabled column to the formulas table if it doesn't exist.
 * The enabled column allows formulas to be enabled/disabled without deletion.
 * 
 * Run with: npx tsx server/migrations/addEnabledColumnToFormulas.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Adding enabled column to formulas table...\n');

    // Check if column already exists
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'formulas' AND column_name = 'enabled';
    `);

    if (checkColumn.rows.length > 0) {
      console.log("✅ 'enabled' column already exists in formulas table, skipping migration");
      return;
    }

    // Add enabled column with default value of true
    await pool.query(`
      ALTER TABLE formulas 
      ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;
    `);
    console.log("✅ Added 'enabled' column to formulas table with default value true");

    // Update all existing formulas to be enabled by default
    await pool.query(`
      UPDATE formulas 
      SET enabled = true 
      WHERE enabled IS NULL;
    `);
    console.log("✅ Updated all existing formulas to enabled = true");

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
