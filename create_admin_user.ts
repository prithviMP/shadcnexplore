import "dotenv/config";
import { db } from "./server/db";
import { users } from "@shared/schema";
import { hashPassword } from "./server/auth";
import { eq } from "drizzle-orm";

/**
 * Script to create a new admin user
 * Usage: npx tsx create_admin_user.ts [email] [password] [name]
 */

async function createAdminUser() {
  const args = process.argv.slice(2);
  const email = args[0] || `admin${Date.now()}@finanalytics.com`;
  const password = args[1] || generateRandomPassword();
  const name = args[2] || "Admin User";

  console.log("🔐 Creating Admin User...");
  console.log("====================");

  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      console.error(`❌ Error: User with email ${email} already exists!`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create admin user
    const [newAdmin] = await db.insert(users).values({
      email,
      password: hashedPassword,
      name,
      role: "admin",
      otpEnabled: false,
      enabled: true,
    }).returning();

    console.log("✅ Admin user created successfully!");
    console.log("");
    console.log("📋 User Credentials:");
    console.log("====================");
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     admin`);
    console.log(`ID:       ${newAdmin.id}`);
    console.log("");
    console.log("⚠️  IMPORTANT: Save these credentials securely!");
    console.log("   The password will not be shown again.");

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error creating admin user:", error.message);
    process.exit(1);
  }
}

function generateRandomPassword(): string {
  // Generate a secure random password
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
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

createAdminUser();

