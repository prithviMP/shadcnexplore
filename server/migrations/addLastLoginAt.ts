/**
 * Migration: Add last_login_at to users (for 7-day OTP requirement)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  const check = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login_at'
  `);
  const rows = (check as { rows?: unknown[] }).rows ?? [];
  if (rows.length > 0) {
    console.log("users.last_login_at already exists. Skipping.");
    return;
  }
  await db.execute(sql`ALTER TABLE users ADD COLUMN last_login_at timestamp`);
  console.log("Added users.last_login_at.");
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
