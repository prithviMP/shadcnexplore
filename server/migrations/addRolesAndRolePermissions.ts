/**
 * Migration: Create roles and role_permissions tables (if they don't exist)
 *
 * This sets up the core schema needed for role/permission management:
 * - roles: metadata for each role (name, description, is_system, permissions snapshot)
 * - role_permissions: permissions assigned to each role (used by the app at runtime)
 *
 * Run with: npx tsx server/migrations/addRolesAndRolePermissions.ts
 */

import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("🔐 Creating roles and role_permissions tables (if needed)...\n");

    // Check if roles table exists
    const rolesTableCheck = await pool.query<
      { exists: boolean }
    >(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'roles'
      ) AS exists;
    `);

    if (!rolesTableCheck.rows[0]?.exists) {
      console.log("➡️  Creating roles table...");
      await pool.query(`
        CREATE TABLE roles (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_system BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log("✅ Created roles table");
    } else {
      console.log("ℹ️  roles table already exists, skipping creation");
    }

    // Check if role_permissions table exists
    const rolePermissionsTableCheck = await pool.query<
      { exists: boolean }
    >(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'role_permissions'
      ) AS exists;
    `);

    if (!rolePermissionsTableCheck.rows[0]?.exists) {
      console.log("➡️  Creating role_permissions table...");
      await pool.query(`
        CREATE TABLE role_permissions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          role TEXT NOT NULL UNIQUE,
          permissions JSONB NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log("✅ Created role_permissions table");
    } else {
      console.log("ℹ️  role_permissions table already exists, skipping creation");
    }

    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});

