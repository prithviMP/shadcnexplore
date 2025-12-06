# Database Migration Guide

This guide explains how to run database migrations on your server.

## Migration: Add updated_at Column to Signals Table

This migration adds the `updated_at` column to the `signals` table, which is required for tracking when signals were last updated.

## Running on Server

### Option 1: Using npm script (Recommended)

1. **SSH into your server:**
   ```bash
   ssh -i /path/to/your-key.pem ec2-user@YOUR_SERVER_IP
   ```

2. **Navigate to the application directory:**
   ```bash
   cd ~/scrapper-screener/ShadcnExplore
   ```

3. **Ensure you have the latest code:**
   ```bash
   git pull
   ```

4. **Install dependencies (if needed):**
   ```bash
   npm install
   ```

5. **Verify your .env file has DATABASE_URL:**
   ```bash
   cat .env | grep DATABASE_URL
   ```

6. **Run the migration:**
   ```bash
   npm run db:migrate-signals-updated-at
   ```

   You should see output like:
   ```
   Adding updated_at column to signals table...
   ✓ Added updated_at column
   ✓ Set initial updated_at values
   ✓ Created index on (company_id, updated_at)
   
   ✅ Migration completed successfully!
   ```

### Option 2: Direct execution

If you prefer to run it directly:

```bash
cd ~/scrapper-screener/ShadcnExplore
npx tsx server/migrations/addUpdatedAtToSignals.ts
```

## Verification

After running the migration, verify it worked:

1. **Connect to your database:**
   ```bash
   # For local PostgreSQL
   psql -d scrapper_screener
   
   # Or using the connection string from .env
   psql $DATABASE_URL
   ```

2. **Check the column exists:**
   ```sql
   \d signals
   ```
   
   You should see `updated_at` in the column list.

3. **Or query directly:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'signals' AND column_name = 'updated_at';
   ```

## Troubleshooting

### Error: "DATABASE_URL environment variable is not set"

- Make sure you have a `.env` file in the `ShadcnExplore` directory
- Verify the `.env` file contains `DATABASE_URL=...`
- Check that you're in the correct directory when running the migration

### Error: "column already exists"

- This means the migration has already been run
- The migration script checks for existing columns and skips if found
- This is safe to ignore

### Error: Connection refused or timeout

- Verify your database is running
- Check that `DATABASE_URL` is correct
- For remote databases, ensure network/firewall allows connections
- For local PostgreSQL: `sudo systemctl status postgresql-15`

### Migration runs but API still shows error

- Restart your application after running the migration:
  ```bash
  pm2 restart scrapper-screener
  ```
- Check application logs:
  ```bash
  pm2 logs scrapper-screener
  ```

## Other Migrations

The following migrations are also available:

- `npm run db:push` - Push schema changes using Drizzle
- `npm run db:seed` - Seed initial data
- `npm run db:create-logs` - Create scraping logs table
- `npm run db:create-history` - Create sector update history table
- `npm run db:update-companies` - Update companies schema
- `npm run db:add-enabled-column` - Add enabled column to users

## Best Practices

1. **Backup before migration:**
   ```bash
   # Backup database before running migrations
   pg_dump $DATABASE_URL > backup_before_migration_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run during maintenance window** if possible

3. **Test on staging first** before production

4. **Monitor application logs** after migration

5. **Verify the migration** using the verification steps above

