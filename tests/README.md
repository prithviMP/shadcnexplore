# Playwright Tests for Banking Metrics

This directory contains end-to-end tests for the banking metrics implementation.

## Setup

1. Install dependencies (if not already installed):
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

## Running Tests

### Run all tests:
```bash
npm run test
```

### Run tests in headed mode (see browser):
```bash
npm run test:headed
```

### Run tests with UI mode (interactive):
```bash
npm run test:ui
```

### Run specific test file:
```bash
npx playwright test banking-metrics.spec.ts
```

## Test Coverage

The tests verify:

1. **Settings Page**:
   - Default and Banking metrics tabs exist
   - Banking metrics can be toggled
   - Banking metrics are saved to database

2. **Company Detail Page**:
   - Banking companies show banking metrics
   - Non-banking companies show default metrics

3. **Sectors List**:
   - Banking sectors show banking metrics

4. **Formula Builder**:
   - Banking entities show banking metrics in preview

5. **API Endpoints**:
   - GET `/api/settings/default-metrics` returns banking metrics
   - PUT `/api/settings/default-metrics` saves banking metrics

## Configuration

- Tests are configured in `playwright.config.ts`
- Default base URL: `http://localhost:5000`
- The config automatically starts the dev server before tests

## Authentication

Update `tests/auth-helpers.ts` with your actual authentication mechanism.

## Adjusting Tests

You may need to adjust:
- Company tickers (HDFCBANK, TCS, etc.) based on your test data
- Selectors if your UI differs
- Authentication flow in `auth-helpers.ts`
- Test data expectations
