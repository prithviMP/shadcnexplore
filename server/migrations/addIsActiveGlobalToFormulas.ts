import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Adding is_active_global column to formulas table...');

    // Check if column already exists
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'formulas' 
        AND column_name = 'is_active_global';
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ is_active_global column already exists, skipping migration');
      return;
    }

    // Add the column
    await pool.query(`
      ALTER TABLE formulas
      ADD COLUMN is_active_global BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log('✓ Added is_active_global column');

    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_formulas_is_active_global
      ON formulas(is_active_global)
      WHERE is_active_global = TRUE;
    `);
    console.log('✓ Created index on is_active_global');

    // Set the first enabled global formula (by priority, then created date) as active
    // This ensures there's at least one active global formula if any exist
    await pool.query(`
      UPDATE formulas
      SET is_active_global = TRUE
      WHERE id = (
        SELECT id
        FROM formulas
        WHERE scope = 'global' AND enabled = TRUE
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
      );
    `);
    console.log('✓ Set initial active global formula');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
