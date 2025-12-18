/**
 * Latest Production Migration Script
 * 
 * This script ensures all required tables and indexes exist for the latest features:
 * - sector_update_history table
 * - scheduler_settings table
 * 
 * Run with: npx tsx server/migrations/latestProductionMigration.ts
 * 
 * This migration is idempotent - safe to run multiple times.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🚀 Starting latest production migration...\n');

    // ============================================
    // 1. Create sector_update_history table
    // ============================================
    console.log('📋 Checking sector_update_history table...');
    const sectorHistoryCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sector_update_history'
      );
    `);

    const sectorHistoryExists = sectorHistoryCheck.rows[0]?.exists;

    if (!sectorHistoryExists) {
      console.log('  → Creating sector_update_history table...');
      await pool.query(`
        CREATE TABLE sector_update_history (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES users(id),
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          total_sectors INTEGER NOT NULL,
          completed_sectors INTEGER DEFAULT 0,
          successful_sectors INTEGER DEFAULT 0,
          failed_sectors INTEGER DEFAULT 0,
          sector_results JSONB DEFAULT '[]'::jsonb,
          error TEXT,
          started_at TIMESTAMP NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log('  ✓ Created sector_update_history table');

      // Create indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sector_update_history_user_id 
        ON sector_update_history(user_id);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sector_update_history_started_at 
        ON sector_update_history(started_at DESC);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sector_update_history_status 
        ON sector_update_history(status);
      `);
      console.log('  ✓ Created indexes for sector_update_history');
    } else {
      console.log('  ✓ sector_update_history table already exists');
    }

    // ============================================
    // 2. Create scheduler_settings table
    // ============================================
    console.log('\n📋 Checking scheduler_settings table...');
    const schedulerSettingsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'scheduler_settings'
      );
    `);

    const schedulerSettingsExists = schedulerSettingsCheck.rows[0]?.exists;

    if (!schedulerSettingsExists) {
      console.log('  → Creating scheduler_settings table...');
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
      console.log('  ✓ Created scheduler_settings table');

      // Create index
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_scheduler_settings_job_type 
        ON scheduler_settings(job_type);
      `);
      console.log('  ✓ Created index for scheduler_settings');

      // Insert default scheduler settings
      await pool.query(`
        INSERT INTO scheduler_settings (job_type, schedule, enabled, description)
        VALUES 
          ('daily-scraping', '0 6 * * *', true, 'Daily scraping for all sectors'),
          ('signal-incremental', '0 2 * * *', true, 'Daily incremental signal refresh'),
          ('signal-full', '0 3 * * 0', true, 'Weekly full signal refresh (Sundays)')
        ON CONFLICT (job_type) DO NOTHING;
      `);
      console.log('  ✓ Inserted default scheduler settings');
    } else {
      console.log('  ✓ scheduler_settings table already exists');
      
      // Ensure default settings exist (in case they were deleted)
      await pool.query(`
        INSERT INTO scheduler_settings (job_type, schedule, enabled, description)
        VALUES 
          ('daily-scraping', '0 6 * * *', true, 'Daily scraping for all sectors'),
          ('signal-incremental', '0 2 * * *', true, 'Daily incremental signal refresh'),
          ('signal-full', '0 3 * * 0', true, 'Weekly full signal refresh (Sundays)')
        ON CONFLICT (job_type) DO NOTHING;
      `);
      console.log('  ✓ Ensured default scheduler settings exist');
    }

    // ============================================
    // 3. Verify critical tables exist
    // ============================================
    console.log('\n📋 Verifying critical tables exist...');
    const requiredTables = [
      'users',
      'sectors',
      'companies',
      'formulas',
      'signals',
      'quarterly_data',
      'role_permissions',
      'sector_update_history',
      'scheduler_settings'
    ];

    const missingTables: string[] = [];
    for (const table of requiredTables) {
      const check = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      
      if (!check.rows[0]?.exists) {
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      console.warn(`  ⚠️  Warning: Missing tables: ${missingTables.join(', ')}`);
      console.warn('     Some tables may need to be created by other migration scripts.');
    } else {
      console.log('  ✓ All critical tables exist');
    }

    console.log('\n✅ Latest production migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - sector_update_history table: ✓');
    console.log('   - scheduler_settings table: ✓');
    console.log('   - Default scheduler settings: ✓');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 Migration process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration process failed:', error);
    process.exit(1);
  });
