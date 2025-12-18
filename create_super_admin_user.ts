import "dotenv/config";
import { db } from "./server/db";
import { users } from "@shared/schema";
import { hashPassword } from "./server/auth";
import { eq } from "drizzle-orm";

/**
 * Script to create a new super admin user
 * Usage:
 *   npx tsx create_super_admin_user.ts [email] [password] [name]
 *
 * If arguments are not provided, it will auto-generate sensible defaults.
 */

async function createSuperAdminUser() {
  const args = process.argv.slice(2);
  const email = args[0] || `superadmin${Date.now()}@finanalytics.com`;
  const password = args[1] || generateRandomPassword();
  const name = args[2] || "Super Admin";

  console.log("🔐 Creating Super Admin User...");
  console.log("==============================");

  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      console.error(`❌ Error: User with email ${email} already exists!`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create super admin user
    const [newSuperAdmin] = await db.insert(users).values({
      email,
      password: hashedPassword,
      name,
      role: "super_admin",
      otpEnabled: false,
      enabled: true,
    }).returning();

    console.log("✅ Super admin user created successfully!");
    console.log("");
    console.log("📋 User Credentials:");
    console.log("====================");
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     super_admin`);
    console.log(`ID:       ${newSuperAdmin.id}`);
    console.log("");
    console.log("⚠️  IMPORTANT: Save these credentials securely!");
    console.log("   The password will not be shown again.");

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error creating super admin user:", error.message || error);
    process.exit(1);
  }
}

function generateRandomPassword(): string {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";

  // Ensure at least one uppercase, one lowercase, one number, and one special char
  password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
  password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
  password += "0123456789"[Math.floor(Math.random() * 10)];
  password += "!@#$%^&*"[Math.floor(Math.random() * 8)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password.split("").sort(() => Math.random() - 0.5).join("");
}

createSuperAdminUser();

