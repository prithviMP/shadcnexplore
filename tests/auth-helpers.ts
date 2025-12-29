/**
 * Authentication helpers for Playwright tests
 * Adjust these based on your actual authentication mechanism
 */

import { Page } from '@playwright/test';

export async function login(page: Page, email: string = 'admin@example.com', password: string = 'admin123') {
  // Navigate to login page or home page
  await page.goto('/');
  
  // Check if already logged in by looking for authenticated content
  const isLoggedIn = await page.locator('text=Dashboard').or(
    page.locator('text=Settings')
  ).first().isVisible().catch(() => false);

  if (isLoggedIn) {
    console.log('Already logged in');
    return;
  }

  // If not logged in, perform login
  // Adjust selectors based on your actual login form
  const emailInput = page.locator('input[type="email"]').or(page.locator('input[name="email"]'));
  const passwordInput = page.locator('input[type="password"]');
  const loginButton = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /login/i }));

  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await loginButton.click();
    
    // Wait for redirect after login
    await page.waitForURL(/\/(?!login)/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  }
}

export async function ensureLoggedIn(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Try to detect if we're on a login page or authenticated
  const hasLoginForm = await page.locator('input[type="password"]').isVisible({ timeout: 2000 }).catch(() => false);
  
  if (hasLoginForm) {
    await login(page);
  }
}
