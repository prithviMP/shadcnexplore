/**
 * Migration: Add formula_type column to formulas table
 * 
 * This migration adds the formula_type column to the formulas table
 * to distinguish between 'simple' and 'excel' formula types.
 * 
 * Run with: npx tsx server/migrations/addFormulaTypeColumn.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Adding formula_type column to formulas table...\n');

    // Check if column already exists
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'formulas' AND column_name = 'formula_type';
    `);

    if (checkColumn.rows.length > 0) {
      console.log("✅ 'formula_type' column already exists in formulas table, skipping migration");
      return;
    }

    // Add formula_type column with default value 'simple'
    await pool.query(`
      ALTER TABLE formulas 
      ADD COLUMN formula_type TEXT DEFAULT 'simple';
    `);
    console.log("✅ Added 'formula_type' column to formulas table with default value 'simple'");

    // Update existing formulas to have formula_type based on their condition
    // Excel formulas typically contain Q12, Q11, P12, P11, IF(, AND(, OR(, etc.
    console.log("Updating existing formulas to set formula_type based on condition...");
    
    await pool.query(`
      UPDATE formulas
      SET formula_type = CASE
        WHEN condition ~ '[QP]\\d+' OR
             condition ~* 'IF\\(' OR
             condition ~* 'AND\\(' OR
             condition ~* 'OR\\(' OR
             condition ~* 'NOT\\(' OR
             condition ~* 'ISNUMBER\\(' OR
             condition ~* 'MIN\\(' OR
             condition ~* 'ABS\\('
        THEN 'excel'
        ELSE 'simple'
      END
      WHERE formula_type IS NULL OR formula_type = 'simple';
    `);
    
    console.log("✅ Updated existing formulas with appropriate formula_type");

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
