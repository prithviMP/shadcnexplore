/**
 * Migration: Create password_reset_tokens table
 * 
 * Run with: npx tsx server/migrations/createPasswordResetTokensTable.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Creating password_reset_tokens table...');

    // Check if table already exists
    const checkResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'password_reset_tokens';
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ password_reset_tokens table already exists, skipping migration');
      return;
    }

    // Create password_reset_tokens table
    await pool.query(`
      CREATE TABLE password_reset_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Created password_reset_tokens table');

    // Create indexes for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token 
      ON password_reset_tokens(token);
    `);
    console.log('✓ Created index on token');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
      ON password_reset_tokens(user_id);
    `);
    console.log('✓ Created index on user_id');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at 
      ON password_reset_tokens(expires_at);
    `);
    console.log('✓ Created index on expires_at');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

