# OPM to Financing Margin Fallback Implementation

## Overview
This document describes the implementation of automatic fallback from OPM (Operating Profit Margin) to Financing Margin % when OPM is not available for a company. This fallback works across **all sectors**, not just banking sectors.

## Requirement
For companies where OPM is not available, the system should automatically select Financing Margin % as a substitute. This should work:
- For any sector (not just banking)
- Even if Financing Margin is part of default metrics
- In all contexts where metrics are retrieved or evaluated

## Implementation Details

### Files Modified

#### 1. `shared/metricUtils.ts` (NEW)
Created a shared utility module with helper functions for metric name normalization and OPM fallback logic:
- `normalizeMetricName()` - Normalizes metric names for matching
- `isOPMMetric()` - Checks if a metric name refers to OPM
- `getFinancingMarginVariations()` - Returns all possible variations of Financing Margin
- `findMetricWithOPMFallback()` - Generic function to find metrics with OPM fallback
- `findMetricInListWithOPMFallback()` - Finds metrics in a list with OPM fallback

#### 2. `server/mainSignalEvaluator.ts`
Updated the `extractQuarterlyMetrics()` function to ensure OPM fallback to Financing Margin works for:
- **Q14** (Current quarter OPM %)
- **P14** (Previous quarter OPM %)

The fallback logic is already in place and now includes comments clarifying it works for all sectors.

#### 3. `server/excelFormulaEvaluator.ts`
Updated the `getCellValue()` method in the `ExcelFormulaEvaluator` class to:
- Check if the requested metric is OPM-related
- If OPM is not found, automatically try Financing Margin variations as fallback
- Works for all sectors, not just banking

#### 4. `client/src/utils/quarterlyFormulaEvaluator.ts`
Updated the `findMetricInData()` function to:
- Include OPM fallback logic for client-side metric lookups
- Try Financing Margin variations when OPM is requested but not found
- Works consistently with server-side logic

## How It Works

### Fallback Logic Flow

1. **Request for OPM metric** (e.g., "OPM %", "Operating Profit Margin %")
2. **Search for OPM** in available metrics
3. **If OPM not found**:
   - Check if the requested metric is OPM-related
   - If yes, try Financing Margin variations:
     - "Financing Margin %"
     - "Financing Margin"
     - "financingmargin"
     - "financing_margin"
     - etc.
4. **Return Financing Margin value** if found, otherwise return null

### Supported OPM Variations
The system recognizes these OPM metric names:
- "OPM %"
- "Operating Profit Margin %"
- "Operating Margin %"
- "opm_percent"
- "operating_profit_margin"
- Any variation containing "opm" or "operatingprofitmargin" or "operatingmargin"

### Supported Financing Margin Variations
When OPM is not available, the system tries these Financing Margin variations:
- "Financing Margin %"
- "Financing Margin"
- "financingmargin"
- "financing_margin"
- "FinancingMargin"
- "financing margin %"
- "financing margin"

## Usage Examples

### Server-Side (Signal Evaluation)
```typescript
// In mainSignalEvaluator.ts
// Q14 automatically falls back to Financing Margin if OPM not available
metrics.Q14 = findMetricByVariations(currentQuarter, [
  'OPM %',
  'Operating Profit Margin %',
  // ... other variations
]);

// Automatic fallback
if (metrics.Q14 === null) {
  metrics.Q14 = findMetricByVariations(currentQuarter, [
    'Financing Margin %',
    // ... other variations
  ]);
}
```

### Excel Formula Evaluation
```typescript
// In excelFormulaEvaluator.ts
// When formula references OPM[Q12], automatically tries Financing Margin if OPM not found
const value = tryFindMetric(metricName); // e.g., "OPM %"

if (value === null && isOPM) {
  // Try Financing Margin as fallback
  value = tryFindMetric('Financing Margin %');
}
```

### Client-Side (Metric Lookup)
```typescript
// In quarterlyFormulaEvaluator.ts
// When looking up OPM in available metrics, falls back to Financing Margin
const metricKey = findMetricInData('OPM %', availableMetrics);
// Returns "Financing Margin %" if OPM not found
```

## Testing

To verify the implementation works:

1. **Test with a company that has Financing Margin but no OPM:**
   - Scrape a company that doesn't have OPM data
   - Verify that Financing Margin is used in signal calculations
   - Check that formulas referencing OPM work correctly

2. **Test across different sectors:**
   - Test with banking companies
   - Test with non-banking companies
   - Verify fallback works in both cases

3. **Test in different contexts:**
   - Signal evaluation (mainSignalEvaluator)
   - Excel formula evaluation (excelFormulaEvaluator)
   - Client-side metric lookups (quarterlyFormulaEvaluator)

## Notes

- The fallback is **automatic** and **transparent** - no configuration needed
- Works for **all sectors**, not just banking
- Even if Financing Margin is part of default metrics, the fallback still works
- The fallback only triggers when OPM is explicitly requested but not found
- If both OPM and Financing Margin are available, OPM takes precedence

## Future Enhancements

The shared `metricUtils.ts` module can be used to:
- Add more fallback logic for other metrics if needed
- Standardize metric name normalization across the codebase
- Create reusable metric lookup functions

