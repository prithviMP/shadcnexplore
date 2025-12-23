#!/bin/bash

# Run All Migrations Script
# This script runs all database migrations in the correct order.
# Safe to run multiple times - migrations are idempotent.

echo "🚀 Starting database migrations..."
echo "This will run all migrations in the correct order."
echo "Note: Migrations are idempotent and safe to run multiple times."
echo ""

# Change to the project directory (adjust if needed)
cd "$(dirname "$0")/../.." || exit 1

# List of migrations in the correct order
MIGRATIONS=(
  "server/migrations/addEnabledColumnToUsers.ts"
  "server/migrations/addEnabledColumnToFormulas.ts"
  "server/migrations/addAssignedFormulaId.ts"
  "server/migrations/addUpdatedAtToSignals.ts"
  "server/migrations/createSchedulerSettingsTable.ts"
  "server/migrations/addSectorSchedulesTable.ts"
  "server/migrations/addBulkImportTables.ts"
  "server/migrations/latestProductionMigration.ts"
)

SUCCESS_COUNT=0
FAILURE_COUNT=0

for migration in "${MIGRATIONS[@]}"; do
  echo "============================================================"
  echo "Running: $migration"
  echo "============================================================"
  
  if npx tsx "$migration"; then
    echo "✅ $migration completed successfully"
    ((SUCCESS_COUNT++))
  else
    echo "❌ $migration failed"
    ((FAILURE_COUNT++))
  fi
  echo ""
  
  # Small delay between migrations
  sleep 0.5
done

echo "============================================================"
echo "📊 Migration Summary"
echo "============================================================"
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAILURE_COUNT"

if [ $FAILURE_COUNT -eq 0 ]; then
  echo ""
  echo "🎉 All migrations completed successfully!"
  exit 0
else
  echo ""
  echo "⚠️  Some migrations failed. Please review the errors above."
  exit 1
fi
