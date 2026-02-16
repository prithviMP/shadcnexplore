/**
 * Quick API check: POST /api/auth/login returns 200 and requiresEmailOTP (no 500 from null phone).
 * Run with: npx tsx scripts/test-login-otp-api.ts
 * Requires server running (e.g. npm run dev) and a valid user in DB (e.g. after seed).
 */

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:5000";
const EMAIL = process.env.TEST_LOGIN_EMAIL || "admin@finanalytics.com";
const PASSWORD = process.env.TEST_LOGIN_PASSWORD || "admin123";

async function main() {
  console.log("POST /api/auth/login -> expect 200 and requiresEmailOTP...");
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Response not JSON:", text.slice(0, 200));
    process.exit(1);
  }
  if (!res.ok) {
    console.error("Status:", res.status, data);
    process.exit(1);
  }
  if (data.requiresEmailOTP !== true) {
    console.error("Expected requiresEmailOTP: true, got:", data);
    process.exit(1);
  }
  console.log("OK: login step 1 returns requiresEmailOTP (OTP created in DB, no null phone error).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
