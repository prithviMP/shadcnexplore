# Database Migrations

This directory contains database migration scripts to update the database schema.

## Running All Migrations

To run all migrations in the correct order, use:

```bash
# Using the shell script (recommended)
./server/migrations/runAllMigrations.sh

# Or using the TypeScript script
npx tsx server/migrations/runAllMigrations.ts

# Or run them manually one by one:
npx tsx server/migrations/addEnabledColumnToUsers.ts
npx tsx server/migrations/addEnabledColumnToFormulas.ts
npx tsx server/migrations/addAssignedFormulaId.ts
npx tsx server/migrations/addUpdatedAtToSignals.ts
npx tsx server/migrations/createSchedulerSettingsTable.ts
npx tsx server/migrations/addSectorSchedulesTable.ts
npx tsx server/migrations/addBulkImportTables.ts
npx tsx server/migrations/latestProductionMigration.ts
```

## Migration Order

Migrations should be run in this order:

1. **addEnabledColumnToUsers.ts** - Adds `enabled` column to users table
2. **addEnabledColumnToFormulas.ts** - Adds `enabled` column to formulas table
3. **addAssignedFormulaId.ts** - Adds formula assignment columns to companies and sectors
4. **addUpdatedAtToSignals.ts** - Adds `updated_at` column to signals table
5. **createSchedulerSettingsTable.ts** - Creates scheduler settings table
6. **addSectorSchedulesTable.ts** - Creates sector schedules table
7. **addBulkImportTables.ts** - Creates bulk import tables
8. **latestProductionMigration.ts** - Creates sector_update_history and ensures all tables exist

## Important Notes

- All migrations are **idempotent** - safe to run multiple times
- Migrations check if columns/tables exist before creating them
- Make sure your `.env` file has the correct `DATABASE_URL` before running migrations
- Always backup your database before running migrations in production

## Production Deployment

After deploying code changes that include new migrations:

1. SSH into your production server
2. Navigate to your project directory
3. Ensure `.env` file has correct `DATABASE_URL`
4. Run the migration script:
   ```bash
   ./server/migrations/runAllMigrations.sh
   ```

## Troubleshooting

If a migration fails:
- Check the error message for specific details
- Verify your database connection (check `DATABASE_URL` in `.env`)
- Check if you have the necessary database permissions
- Some migrations depend on others - run them in order
