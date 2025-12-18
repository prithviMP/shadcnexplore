/**
 * Seed base roles (super_admin, admin, analyst, viewer) into:
 * - roles table (metadata, is_system flag, permissions snapshot)
 * - role_permissions table (runtime permission lookup)
 *
 * Run with: npx tsx server/migrations/seedBaseRoles.ts
 */

import "dotenv/config";
import { Pool } from "pg";
import { DEFAULT_ROLE_PERMISSIONS } from "../permissions";

async function seedBaseRoles() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("🌱 Seeding base roles and role permissions...\n");

    // Ensure tables exist (in case migration hasn't been run yet)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        role TEXT NOT NULL UNIQUE,
        permissions JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    const systemRoleDescriptions: Record<string, string> = {
      super_admin: "Super Admin – full access to all features and role management.",
      admin: "Admin – manage data and users, but limited system configuration.",
      analyst: "Analyst – can analyze data and run queries with limited management permissions.",
      viewer: "Viewer – read-only access to dashboards and basic data.",
    };

    // Seed each role defined in DEFAULT_ROLE_PERMISSIONS
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const description = systemRoleDescriptions[role] ?? `${role} role`;
      const isSystem = ["super_admin", "admin", "analyst", "viewer"].includes(role);

      console.log(`➡️  Upserting role '${role}' with ${permissions.length} permissions...`);

      // Upsert into roles table
      await pool.query(
        `
          INSERT INTO roles (name, description, permissions, is_system)
          VALUES ($1, $2, $3::jsonb, $4)
          ON CONFLICT (name)
          DO UPDATE SET
            description = EXCLUDED.description,
            permissions = EXCLUDED.permissions,
            is_system = EXCLUDED.is_system;
        `,
        [role, description, JSON.stringify(permissions), isSystem],
      );

      // Upsert into role_permissions table
      await pool.query(
        `
          INSERT INTO role_permissions (role, permissions)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (role)
          DO UPDATE SET
            permissions = EXCLUDED.permissions,
            updated_at = NOW();
        `,
        [role, JSON.stringify(permissions)],
      );

      console.log(`✅ Seeded role '${role}'`);
    }

    console.log("\n✅ Base roles and permissions seeding completed successfully!");
  } catch (error) {
    console.error("❌ Failed to seed base roles:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedBaseRoles().catch((error) => {
  console.error(error);
  process.exit(1);
});

