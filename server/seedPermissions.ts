/**
 * Seed role permissions into the database
 * This should be run on application startup or as a migration
 */

import { storage } from "./storage";
import { DEFAULT_ROLE_PERMISSIONS } from "./permissions";

export async function seedRolePermissions(): Promise<void> {
  console.log("Seeding role permissions...");

  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await storage.upsertRolePermissions(role, permissions);
    console.log(`✓ Seeded permissions for role: ${role} (${permissions.length} permissions)`);
  }

  console.log("Role permissions seeding completed.");
}

