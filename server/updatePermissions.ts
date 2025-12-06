/**
 * Update role permissions in the database
 * Run with: npx tsx server/updatePermissions.ts
 */

import { seedRolePermissions } from "./seedPermissions";

async function updatePermissions() {
  try {
    console.log("Updating role permissions...");
    await seedRolePermissions();
    console.log("\n✅ Permissions updated successfully!");
    console.log("Note: You may need to log out and log back in for changes to take effect.");
  } catch (error) {
    console.error("Failed to update permissions:", error);
    process.exit(1);
  }
}

updatePermissions();

