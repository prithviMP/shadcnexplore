/**
 * Migration: Make otp_codes.phone nullable
 * Two-step login sends OTP to email only; phone is optional (e.g. for future SMS).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Migration: Make otp_codes.phone nullable...");

  const check = await db.execute(sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'otp_codes'
      AND column_name = 'phone'
  `);

  const rows = (check as { rows?: { column_name: string; is_nullable: string }[] }).rows ?? [];
  if (rows.length === 0) {
    console.log("Column otp_codes.phone does not exist. Skipping.");
    return;
  }
  if (rows[0].is_nullable === "YES") {
    console.log("Column otp_codes.phone is already nullable. Skipping.");
    return;
  }

  await db.execute(sql`
    ALTER TABLE otp_codes
    ALTER COLUMN phone DROP NOT NULL
  `);
  console.log("otp_codes.phone is now nullable.");
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
