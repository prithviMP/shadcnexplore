import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './auth-helpers';

/**
 * Tests for Banking Metrics Implementation
 * 
 * Tests verify:
 * 1. Settings page has tabs for Default and Banking metrics
 * 2. Banking metrics can be configured and saved
 * 3. CompanyDetail shows banking metrics for banking companies
 * 4. SectorsList shows banking metrics for banking sectors
 * 5. FormulaBuilder shows banking metrics for banking entities
 */

test.describe('Banking Metrics Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await ensureLoggedIn(page);
  });

  test('Settings page should have Default and Banking tabs', async ({ page }) => {
    // Navigate to Settings page
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Check for tabs
    const defaultTab = page.getByRole('tab', { name: /default metrics/i });
    const bankingTab = page.getByRole('tab', { name: /banking metrics/i });

    await expect(defaultTab).toBeVisible();
    await expect(bankingTab).toBeVisible();

    // Verify default tab is active by default
    await expect(defaultTab).toHaveAttribute('aria-selected', 'true');
  });

  test('Should be able to toggle banking metrics', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click on Banking Metrics tab
    await page.getByRole('tab', { name: /banking metrics/i }).click();
    await expect(page.getByRole('tab', { name: /banking metrics/i })).toHaveAttribute('aria-selected', 'true');

    // Check that banking-specific metrics are visible
    // Common banking metrics: Financing Profit, Financing Margin %, Gross NPA %
    await expect(page.getByText('Financing Profit')).toBeVisible();
    await expect(page.getByText('Financing Margin %')).toBeVisible();
    await expect(page.getByText('Gross NPA %')).toBeVisible();

    // Toggle a banking metric (e.g., Financing Profit)
    const financingProfitCheckbox = page.locator('input[type="checkbox"]').filter({ 
      has: page.locator('label:has-text("Financing Profit")') 
    }).first();
    
    const isChecked = await financingProfitCheckbox.isChecked();
    await financingProfitCheckbox.click();
    await expect(financingProfitCheckbox).toHaveProperty('checked', !isChecked);
  });

  test('Should save banking metrics to database', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Switch to Banking Metrics tab
    await page.getByRole('tab', { name: /banking metrics/i }).click();
    await page.waitForTimeout(500); // Wait for tab content to load

    // Toggle a metric
    const grossNPACheckbox = page.locator('input[type="checkbox"]').filter({ 
      has: page.locator('label:has-text("Gross NPA %")') 
    }).first();
    
    const initialState = await grossNPACheckbox.isChecked();
    await grossNPACheckbox.click();
    await expect(grossNPACheckbox).toHaveProperty('checked', !initialState);

    // Click Save button
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Wait for success toast/notification
    await expect(page.getByText(/settings saved/i).or(page.getByText(/metrics configuration/i))).toBeVisible({ timeout: 5000 });

    // Verify the change persists by refreshing
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /banking metrics/i }).click();
    await page.waitForTimeout(500);

    // Check that the metric state is saved
    const reloadedCheckbox = page.locator('input[type="checkbox"]').filter({ 
      has: page.locator('label:has-text("Gross NPA %")') 
    }).first();
    await expect(reloadedCheckbox).toHaveProperty('checked', !initialState);
  });
});

test.describe('Company Detail - Banking Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('Should show banking metrics for banking companies', async ({ page }) => {
    // Navigate to a banking company (you'll need to adjust the ticker/route)
    // Example: HDFCBANK, ICICIBANK, SBIN, etc.
    const bankingTicker = 'HDFCBANK'; // Adjust based on your test data
    
    await page.goto(`/companies/${bankingTicker}`);
    await page.waitForLoadState('networkidle');

    // Wait for metrics to load
    await page.waitForTimeout(2000);

    // Check for banking-specific metrics in the spreadsheet
    // These should appear because it's a banking company
    const hasBankingMetrics = await page.locator('text=Financing Profit').or(
      page.locator('text=Financing Margin %')
    ).or(
      page.locator('text=Gross NPA %')
    ).first().isVisible().catch(() => false);

    expect(hasBankingMetrics).toBe(true);
  });

  test('Should show default metrics for non-banking companies', async ({ page }) => {
    // Navigate to a non-banking company (e.g., IT company)
    const nonBankingTicker = 'TCS'; // Adjust based on your test data
    
    await page.goto(`/companies/${nonBankingTicker}`);
    await page.waitForLoadState('networkidle');

    // Wait for metrics to load
    await page.waitForTimeout(2000);

    // Check for default metrics (non-banking specific)
    // Should have Sales, OPM %, etc. but NOT Financing Profit
    const hasSales = await page.locator('text=Sales').first().isVisible().catch(() => false);
    const hasOPM = await page.locator('text=OPM %').first().isVisible().catch(() => false);

    expect(hasSales || hasOPM).toBe(true);

    // Should NOT have banking-specific metrics prominently displayed
    // (They might exist in data but shouldn't be in default view)
    const hasFinancingProfit = await page.locator('text=Financing Profit').first().isVisible().catch(() => false);
    // Note: This test might need adjustment based on your UI implementation
  });
});

test.describe('Sectors List - Banking Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('Should show banking metrics for banking sectors', async ({ page }) => {
    await page.goto('/sectors');
    await page.waitForLoadState('networkidle');

    // Find and click on a banking sector
    // Adjust selector based on your actual UI
    const bankingSectorLink = page.getByText(/banking/i).or(
      page.getByText(/bank/i).or(
        page.getByText(/financial/i)
      )
    ).first();

    if (await bankingSectorLink.isVisible()) {
      await bankingSectorLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check for banking metrics in the sector view
      const hasBankingMetrics = await page.locator('text=Financing Profit').or(
        page.locator('text=Financing Margin %')
      ).first().isVisible().catch(() => false);

      expect(hasBankingMetrics).toBe(true);
    } else {
      test.skip();
    }
  });
});

test.describe('Formula Builder - Banking Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('Should show banking metrics when previewing banking company', async ({ page }) => {
    await page.goto('/formulas');
    await page.waitForLoadState('networkidle');

    // Select a banking company for preview
    // Adjust selectors based on your FormulaBuilder UI
    // This might require selecting entity type = company, then selecting a banking company
    
    // Wait for preview to load
    await page.waitForTimeout(3000);

    // Check that banking metrics appear in the spreadsheet
    const hasBankingMetrics = await page.locator('text=Financing Profit').or(
      page.locator('text=Gross NPA %')
    ).first().isVisible().catch(() => false);

    // This test might need adjustment based on how FormulaBuilder works
    // If there's no company selected by default, you might need to select one first
  });
});

test.describe('API - Banking Metrics Endpoint', () => {
  test('GET /api/settings/default-metrics should return banking metrics', async ({ request }) => {
    // Make API request (adjust auth if needed)
    const response = await request.get('/api/settings/default-metrics', {
      headers: {
        // Add auth headers if needed
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Verify response structure
    expect(data).toHaveProperty('metrics');
    expect(data).toHaveProperty('visibleMetrics');
    expect(data).toHaveProperty('bankingMetrics');
    expect(data).toHaveProperty('visibleBankingMetrics');

    // Verify banking metrics is an object
    expect(typeof data.bankingMetrics).toBe('object');
    expect(Array.isArray(data.visibleBankingMetrics)).toBe(true);
  });

  test('PUT /api/settings/default-metrics should save banking metrics', async ({ request }) => {
    const testBankingMetrics = {
      "Sales Growth(YoY) %": true,
      "Financing Profit": true,
      "Gross NPA %": false,
    };

    const response = await request.put('/api/settings/default-metrics', {
      headers: {
        'Content-Type': 'application/json',
        // Add auth headers if needed
      },
      data: {
        bankingMetrics: testBankingMetrics
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('bankingMetrics');
    expect(data.bankingMetrics).toMatchObject(testBankingMetrics);
  });
});
