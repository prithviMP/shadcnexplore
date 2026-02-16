/**
 * Migration: Add email column to otp_codes table (two-step login)
 * The schema expects otp_codes.email; older DBs may have been created without it.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Migration: Add email column to otp_codes...");

  const check = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'otp_codes'
      AND column_name = 'email'
  `);

  const rows = (check as { rows?: { column_name: string }[] }).rows ?? [];
  if (rows.length > 0) {
    console.log("Column otp_codes.email already exists. Skipping.");
    return;
  }

  await db.execute(sql`
    ALTER TABLE otp_codes
    ADD COLUMN email text NOT NULL DEFAULT ''
  `);
  console.log("Added otp_codes.email.");
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
