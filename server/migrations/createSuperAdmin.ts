/**
 * Create Super Admin User Script
 * 
 * This script creates a super admin user in the database.
 * 
 * Usage:
 *   npx tsx server/migrations/createSuperAdmin.ts <email> <password> <name>
 * 
 * Example:
 *   npx tsx server/migrations/createSuperAdmin.ts admin@example.com MySecurePass123 "Super Admin"
 * 
 * If no arguments provided, it will prompt for them interactively.
 * 
 * This script is idempotent - if the user already exists, it will update the password
 * and role if needed, or skip if already a super_admin.
 */

import "dotenv/config";
import { db } from "../db";
import { users } from "@shared/schema";
import { hashPassword } from "../auth";
import { eq } from "drizzle-orm";
import * as readline from "readline";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function createSuperAdmin(email?: string, password?: string, name?: string) {
  try {
    // Get arguments from command line or prompt
    let finalEmail = email;
    let finalPassword = password;
    let finalName = name;

    if (!finalEmail) {
      finalEmail = await prompt("Enter email for super admin: ");
    }

    if (!finalPassword) {
      finalPassword = await prompt("Enter password for super admin: ");
    }

    if (!finalName) {
      finalName = await prompt("Enter name for super admin: ");
    }

    if (!finalEmail || !finalPassword || !finalName) {
      console.error("❌ Error: Email, password, and name are required");
      process.exit(1);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalEmail)) {
      console.error("❌ Error: Invalid email format");
      process.exit(1);
    }

    // Validate password length
    if (finalPassword.length < 6) {
      console.error("❌ Error: Password must be at least 6 characters");
      process.exit(1);
    }

    console.log(`\n🔐 Creating super admin user...\n`);
    console.log(`   Email: ${finalEmail}`);
    console.log(`   Name: ${finalName}`);
    console.log(`   Role: super_admin\n`);

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, finalEmail))
      .limit(1);

    if (existingUser.length > 0) {
      const user = existingUser[0];
      
      if (user.role === "super_admin") {
        console.log(`ℹ️  User ${finalEmail} already exists with super_admin role`);
        
        // Ask if user wants to update password
        const updatePassword = await prompt("Do you want to update the password? (y/N): ");
        if (updatePassword.toLowerCase() === "y" || updatePassword.toLowerCase() === "yes") {
          const hashedPassword = await hashPassword(finalPassword);
          await db
            .update(users)
            .set({ password: hashedPassword })
            .where(eq(users.id, user.id));
          console.log("✅ Password updated successfully");
        } else {
          console.log("ℹ️  Password not updated");
        }
        
        console.log(`\n✅ Super admin user ready: ${finalEmail}`);
        process.exit(0);
      } else {
        // User exists but not super_admin
        console.log(`⚠️  User ${finalEmail} exists with role: ${user.role}`);
        const upgrade = await prompt("Do you want to upgrade to super_admin? (y/N): ");
        
        if (upgrade.toLowerCase() === "y" || upgrade.toLowerCase() === "yes") {
          const hashedPassword = await hashPassword(finalPassword);
          await db
            .update(users)
            .set({
              role: "super_admin",
              password: hashedPassword,
              name: finalName,
            })
            .where(eq(users.id, user.id));
          console.log("✅ User upgraded to super_admin and password updated");
          console.log(`\n✅ Super admin user ready: ${finalEmail}`);
          process.exit(0);
        } else {
          console.log("ℹ️  User not upgraded");
          process.exit(0);
        }
      }
    }

    // Create new user
    const hashedPassword = await hashPassword(finalPassword);
    const [newUser] = await db
      .insert(users)
      .values({
        email: finalEmail,
        password: hashedPassword,
        name: finalName,
        role: "super_admin",
        otpEnabled: false,
        enabled: true,
      })
      .returning();

    console.log(`\n✅ Super admin user created successfully!`);
    console.log(`\n📋 User Details:`);
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Name: ${newUser.name}`);
    console.log(`   Role: ${newUser.role}`);
    console.log(`\n🔐 Login with:`);
    console.log(`   Email: ${finalEmail}`);
    console.log(`   Password: ${finalPassword}\n`);
  } catch (error: any) {
    console.error("\n❌ Error creating super admin:", error.message);
    if (error.message?.includes("unique constraint") || error.message?.includes("duplicate key")) {
      console.error("   A user with this email already exists");
    }
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0];
const password = args[1];
const name = args[2] || args.slice(2).join(" "); // Join remaining args as name

// Run the script
createSuperAdmin(email, password, name)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
