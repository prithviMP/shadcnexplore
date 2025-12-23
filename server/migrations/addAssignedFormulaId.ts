/**
 * Migration: Add assignedFormulaId column to companies and sectors tables
 * 
 * This enables assigning existing formulas to companies/sectors for signal calculation.
 * Hierarchy: Company assignedFormulaId > Sector assignedFormulaId > Global formula
 * 
 * Run with: npx tsx server/migrations/addAssignedFormulaId.ts
 */

import { Pool } from 'pg';
import "dotenv/config";

// Validate DATABASE_URL before proceeding
if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  console.error('   Please set DATABASE_URL in your .env file or environment variables');
  process.exit(1);
}

if (typeof process.env.DATABASE_URL !== 'string') {
  console.error('❌ Error: DATABASE_URL must be a string');
  process.exit(1);
}

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Adding assigned_formula_id columns to companies and sectors tables...\n');

    // Check if column already exists in companies table
    const checkCompanies = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'companies' AND column_name = 'assigned_formula_id';
    `);

    if (checkCompanies.rows.length > 0) {
      console.log('✓ assigned_formula_id column already exists in companies table, skipping');
    } else {
      // Add assigned_formula_id column to companies
      await pool.query(`
        ALTER TABLE companies 
        ADD COLUMN assigned_formula_id VARCHAR;
      `);
      console.log('✓ Added assigned_formula_id column to companies table');

      // Create index for efficient formula lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_companies_assigned_formula 
        ON companies(assigned_formula_id);
      `);
      console.log('✓ Created index on companies.assigned_formula_id');
    }

    // Check if column already exists in sectors table
    const checkSectors = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sectors' AND column_name = 'assigned_formula_id';
    `);

    if (checkSectors.rows.length > 0) {
      console.log('✓ assigned_formula_id column already exists in sectors table, skipping');
    } else {
      // Add assigned_formula_id column to sectors
      await pool.query(`
        ALTER TABLE sectors 
        ADD COLUMN assigned_formula_id VARCHAR;
      `);
      console.log('✓ Added assigned_formula_id column to sectors table');

      // Create index for efficient formula lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sectors_assigned_formula 
        ON sectors(assigned_formula_id);
      `);
      console.log('✓ Created index on sectors.assigned_formula_id');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nFormula assignment hierarchy:');
    console.log('  1. Company assignedFormulaId (highest priority)');
    console.log('  2. Sector assignedFormulaId');
    console.log('  3. Global formula (fallback)');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

