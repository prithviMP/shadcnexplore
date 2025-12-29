/**
 * Migration: Create app_settings table for storing application settings like default metrics
 * Run with: npx tsx server/migrations/createAppSettingsTable.ts
 */

import { Pool } from "pg";
import "dotenv/config";

// Validate DATABASE_URL before proceeding
if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  console.error('   Please set DATABASE_URL in your .env file or environment variables');
  console.error('   Example: DATABASE_URL="postgresql://user:password@host:port/database"');
  process.exit(1);
}

if (typeof process.env.DATABASE_URL !== 'string') {
  console.error('❌ Error: DATABASE_URL must be a string');
  process.exit(1);
}

// Check if DATABASE_URL is empty or just whitespace
const dbUrl = process.env.DATABASE_URL.trim();
if (!dbUrl || dbUrl.length === 0) {
  console.error('❌ Error: DATABASE_URL is empty');
  console.error('   Please set a valid DATABASE_URL in your .env file');
  process.exit(1);
}

// Validate that it looks like a PostgreSQL connection string
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  console.error('❌ Error: DATABASE_URL must start with postgresql:// or postgres://');
  console.error('   Current value (masked):', dbUrl.substring(0, 20) + '...');
  console.error('   Example format: postgresql://user:password@host:port/database');
  process.exit(1);
}

// Parse and validate the connection string components
let parsedUrl: URL;
try {
  parsedUrl = new URL(dbUrl);
  
  // Validate required components
  if (!parsedUrl.hostname) {
    console.error('❌ Error: DATABASE_URL is missing hostname');
    console.error('   Format should be: postgresql://user:password@host:port/database');
    process.exit(1);
  }
  
  if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
    console.error('❌ Error: DATABASE_URL is missing database name');
    console.error('   Format should be: postgresql://user:password@host:port/database');
    console.error('   Current URL (masked):', dbUrl.replace(/:([^:@]+)@/, ':****@'));
    process.exit(1);
  }
  
  // Check if password is missing (username exists but no password after colon)
  const hasPassword = parsedUrl.password !== undefined && parsedUrl.password !== '';
  if (!hasPassword && parsedUrl.username) {
    console.warn('⚠ Warning: DATABASE_URL appears to be missing a password');
    console.warn('   If your PostgreSQL requires a password, add it to the connection string');
    console.warn('   Format: postgresql://username:password@host:port/database');
    console.warn('   If using passwordless authentication, ensure PostgreSQL is configured for trust/md5');
  }
  
  // Debug: Show parsed components (masked)
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log('🔗 Connecting to database:', maskedUrl);
  console.log('   Host:', parsedUrl.hostname);
  console.log('   Port:', parsedUrl.port || '5432 (default)');
  console.log('   Database:', parsedUrl.pathname.substring(1));
  console.log('   Username:', parsedUrl.username || '(none)');
  console.log('   Password:', hasPassword ? '****' : '(none - may cause authentication issues)');
} catch (urlError: any) {
  console.error('❌ Error: DATABASE_URL is not a valid URL');
  console.error('   Error:', urlError.message);
  console.error('   Current value (masked):', dbUrl.substring(0, 50) + '...');
  console.error('   Expected format: postgresql://user:password@host:port/database');
  console.error('   Example: postgresql://myuser:mypass@localhost:5432/mydb');
  process.exit(1);
}

async function migrate() {
  // Parse connection string into components to handle missing password properly
  const url = new URL(dbUrl);
  
  // Check if password is missing - SCRAM authentication requires a password
  const hasPassword = url.password && url.password.length > 0;
  
  if (!hasPassword) {
    console.error('❌ Error: PostgreSQL SCRAM authentication requires a password');
    console.error('   Your DATABASE_URL is missing a password');
    console.error('');
    console.error('   Solution 1: Add password to DATABASE_URL');
    console.error('   DATABASE_URL="postgresql://prithvirajpillai:YOUR_PASSWORD@localhost:5432/scrapper_screener"');
    console.error('');
    console.error('   Solution 2: Set PostgreSQL password for your user');
    console.error('   Run: sudo -u postgres psql -c "ALTER USER prithvirajpillai PASSWORD \'your_password\';"');
    console.error('   Then update DATABASE_URL with the password');
    console.error('');
    console.error('   Solution 3: Change PostgreSQL auth method (less secure, for localhost only)');
    console.error('   Edit /var/lib/pgsql/data/pg_hba.conf and change "scram-sha-256" to "trust" for localhost');
    console.error('   Then restart PostgreSQL: sudo systemctl restart postgresql');
    process.exit(1);
  }
  
  // Build connection config explicitly
  const poolConfig: any = {
    host: url.hostname,
    port: parseInt(url.port || '5432'),
    database: url.pathname.substring(1),
    user: url.username || undefined,
    password: url.password || '', // Ensure it's always a string
  };
  
  // Add any query parameters (like sslmode)
  if (url.search) {
    const params = new URLSearchParams(url.search);
    if (params.has('sslmode')) {
      poolConfig.ssl = params.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false;
    }
  }
  
  // Verify password is a string (not null/undefined)
  if (typeof poolConfig.password !== 'string') {
    console.error('❌ Error: Password must be a string');
    console.error('   Password type:', typeof poolConfig.password);
    process.exit(1);
  }
  
  const pool = new Pool(poolConfig);

  try {
    console.log('Creating app_settings table...');
    
    // Test connection first to provide better error messages
    try {
      await pool.query('SELECT 1');
    } catch (connError: any) {
      // Handle specific PostgreSQL errors with helpful messages
      if (connError.code === '28000' || connError.message?.includes('does not exist')) {
        console.error('❌ Error: PostgreSQL user/role does not exist');
        console.error(`   User "${poolConfig.user}" was not found in PostgreSQL`);
        console.error('');
        console.error('   Solution 1: Create the PostgreSQL user');
        console.error(`   Run: sudo -u postgres psql -c "CREATE USER ${poolConfig.user} WITH PASSWORD 'your_password';"`);
        console.error(`   Then: sudo -u postgres psql -c "ALTER USER ${poolConfig.user} CREATEDB;"`);
        console.error(`   Update DATABASE_URL: postgresql://${poolConfig.user}:your_password@localhost:5432/scrapper_screener`);
        console.error('');
        console.error('   Solution 2: Use existing PostgreSQL user (e.g., postgres)');
        console.error('   Update DATABASE_URL: postgresql://postgres:postgres_password@localhost:5432/scrapper_screener');
        console.error('');
        console.error('   Solution 3: List existing users');
        console.error('   Run: sudo -u postgres psql -c "\\du"');
        await pool.end();
        process.exit(1);
      }
      // Re-throw other connection errors
      throw connError;
    }

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
