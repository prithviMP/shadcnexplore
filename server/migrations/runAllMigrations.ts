/**
 * Run All Migrations
 * 
 * This script runs all database migrations in the correct order.
 * Safe to run multiple times - migrations are idempotent.
 * 
 * Run with: npx tsx server/migrations/runAllMigrations.ts
 */

import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function runMigration(scriptName: string): Promise<boolean> {
  try {
    const scriptPath = resolve(__dirname, scriptName);
    const projectRoot = resolve(__dirname, '../..');
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${scriptName}`);
    console.log('='.repeat(60));
    
    execSync(`npx tsx "${scriptPath}"`, {
      stdio: 'inherit',
      cwd: projectRoot,
      env: process.env
    });
    
    console.log(`✅ ${scriptName} completed successfully\n`);
    return true;
  } catch (error: any) {
    console.error(`❌ ${scriptName} failed:`, error.message);
    return false;
  }
}

async function runAllMigrations() {
  console.log('🚀 Starting database migrations...\n');
  console.log('This will run all migrations in the correct order.');
  console.log('Note: Migrations are idempotent and safe to run multiple times.\n');

  // List of migrations in the correct order
  // Order matters for migrations with dependencies
  const migrations = [
    // Core tables (should already exist from initial setup)
    // 'addRolesAndRolePermissions.ts',  // Roles and permissions
    // 'seedBaseRoles.ts',                // Seed base roles (optional)
    
    // User-related migrations
    'addEnabledColumnToUsers.ts',
    
    // Formula-related migrations
    'addAssignedFormulaId.ts',
    'addEnabledColumnToFormulas.ts',
    'addFormulaTypeColumn.ts',
    
    // Signal-related migrations
    'addUpdatedAtToSignals.ts',
    
    // Scheduler-related migrations
    'createSchedulerSettingsTable.ts',
    'addSectorSchedulesTable.ts',
    
    // Bulk import migrations
    'addBulkImportTables.ts',
    
    // Optional/utility migrations (can be run separately)
    // 'createSuperAdmin.ts',              // Only if you need to create super admin
    // 'fixGlobalFormula.ts',              // Only if you need to fix formulas
  ];

  let successCount = 0;
  let failureCount = 0;
  const failures: string[] = [];

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (success) {
      successCount++;
    } else {
      failureCount++;
      failures.push(migration);
    }
    
    // Small delay between migrations
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  
  if (failures.length > 0) {
    console.log('\nFailed migrations:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  
  if (failureCount === 0) {
    console.log('\n🎉 All migrations completed successfully!');
  } else {
    console.log('\n⚠️  Some migrations failed. Please review the errors above.');
    process.exit(1);
  }
}

runAllMigrations().catch((error) => {
  console.error('\n❌ Fatal error running migrations:', error);
  process.exit(1);
});
