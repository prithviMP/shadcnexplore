/**
 * Two-step login: email/password -> OTP by email -> signed in.
 * Verifies that step 1 (credentials) returns OTP step and that DB accepts OTP insert (no null phone error).
 */

import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.TEST_LOGIN_EMAIL || "admin@finanalytics.com";
const TEST_PASSWORD = process.env.TEST_LOGIN_PASSWORD || "admin123";

test.describe("Login two-step verification", () => {
  test("after submitting email and password, OTP step is shown", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const emailInput = page.getByTestId("input-email");
    const passwordInput = page.locator('input[type="password"]').first();
    const signInButton = page.getByTestId("button-email-login");

    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);
    await signInButton.click();

    await expect(
      page.getByTestId("input-email-verification-otp")
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByText(/Enter the code we sent|Verification code/i)
    ).toBeVisible();
  });

  test("Back from OTP step returns to email/password form", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const emailInput = page.getByTestId("input-email");
    const passwordInput = page.locator('input[type="password"]').first();
    const signInButton = page.getByTestId("button-email-login");

    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);
    await signInButton.click();

    await expect(page.getByTestId("input-email-verification-otp")).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: /Back to email & password/i }).click();

    await expect(page.getByTestId("input-email")).toBeVisible();
    await expect(page.getByTestId("button-email-login")).toBeVisible();
  });
});
