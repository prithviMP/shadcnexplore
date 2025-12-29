/**
 * Migration: Create app_settings table for storing application settings like default metrics
 * Run with: npx tsx server/migrations/createAppSettingsTable.ts
 */

import { Pool } from "pg";
import "dotenv/config";

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Creating app_settings table...');

    // Check if table already exists
    const checkResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'app_settings';
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ app_settings table already exists, skipping migration');
      return;
    }

    // Create app_settings table
    await pool.query(`
      CREATE TABLE app_settings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Created app_settings table');

    // Create index on key for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_app_settings_key 
      ON app_settings(key);
    `);
    console.log('✓ Created index on key');

    // Migrate existing JSON file settings to database if it exists
    try {
      const { readFileSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const CONFIG_DIR = join(process.cwd(), "config");
      const VISIBLE_METRICS_FILE = join(CONFIG_DIR, "visible_metrics.json");

      if (existsSync(VISIBLE_METRICS_FILE)) {
        const content = readFileSync(VISIBLE_METRICS_FILE, "utf-8");
        const metrics = JSON.parse(content);
        
        if (metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0) {
          await pool.query(`
            INSERT INTO app_settings (key, value, description)
            VALUES ('default_metrics', $1::jsonb, 'Default metrics configuration for displaying quarterly data')
            ON CONFLICT (key) DO UPDATE 
            SET value = EXCLUDED.value, 
                description = EXCLUDED.description,
                updated_at = NOW();
          `, [JSON.stringify(metrics)]);
          console.log('✓ Migrated default_metrics from JSON file to database');
        }
      }
    } catch (migrateError: any) {
      console.warn('⚠ Could not migrate JSON settings (this is okay if file doesn\'t exist):', migrateError?.message || migrateError);
    }

    // Initialize default banking metrics if they don't exist
    try {
      // Define default banking metrics inline since it's just for migration
      const DEFAULT_BANKING_METRICS = {
        "Sales Growth(YoY) %": true,
        "Sales Growth(QoQ) %": true,
        "Financing Profit": true,
        "Financing Margin %": true,
        "EPS in Rs": true,
        "EPS Growth(YoY) %": true,
        "EPS Growth(QoQ) %": true,
        "Gross NPA %": true
      };
      
      const result = await pool.query(`
        SELECT key FROM app_settings WHERE key = 'default_metrics_banking';
      `);
      
      if (result.rows.length === 0) {
        await pool.query(`
          INSERT INTO app_settings (key, value, description)
          VALUES ('default_metrics_banking', $1::jsonb, 'Default metrics configuration for banking companies/sectors')
          ON CONFLICT (key) DO NOTHING;
        `, [JSON.stringify(DEFAULT_BANKING_METRICS)]);
        console.log('✓ Initialized default_metrics_banking in database');
      } else {
        console.log('✓ default_metrics_banking already exists in database');
      }
    } catch (bankingError: any) {
      console.warn('⚠ Could not initialize banking metrics (this is okay):', bankingError?.message || bankingError);
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
