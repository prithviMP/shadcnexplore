# Excel Formula Guide

This guide provides comprehensive documentation for using Excel-style formulas in the Formula Builder. All formulas support quarterly metric references and can be used to create custom trading signals.

## Table of Contents

1. [Basic Syntax](#basic-syntax)
2. [Quarterly Metric References](#quarterly-metric-references)
3. [Logical Functions](#logical-functions)
4. [Math Functions](#math-functions)
5. [Text Functions](#text-functions)
6. [Error Handling Functions](#error-handling-functions)
7. [Conditional Aggregation Functions](#conditional-aggregation-functions)
8. [Common Patterns](#common-patterns)
9. [Troubleshooting](#troubleshooting)

## Basic Syntax

Formulas can start with `=` or without it. All formulas are case-insensitive.

**Examples:**
```
=IF(Sales[Q1] > 1000, "BUY", "HOLD")
IF(Sales[Q1] > 1000, "BUY", "HOLD")
```

### Operators

- **Arithmetic**: `+`, `-`, `*`, `/`
- **Comparison**: `=`, `>`, `<`, `>=`, `<=`, `<>` (not equal)
- **Logical**: Use functions `AND()`, `OR()`, `NOT()`

## Quarterly Metric References

Metrics are referenced using the format: `MetricName[Qn]`

- **Q1** = Most Recent Quarter
- **Q2** = Previous Quarter
- **Q3** = Two Quarters Ago
- And so on...

You can also use numeric indices: `MetricName[1]`, `MetricName[2]`, etc.

**Examples:**
```
Revenue[Q1]          // Most recent quarter revenue
Revenue[Q2]          // Previous quarter revenue
SalesGrowth[Q1]     // Most recent sales growth
```

## Logical Functions

### IF(condition, true_value, false_value)

Returns `true_value` if condition is true, otherwise `false_value`.

**Example:**
```
IF(Revenue[Q1] > 1000, "BUY", "HOLD")
IF(ROE[Q1] > 0.15 AND Debt[Q1] < 0.5, "BUY", "SELL")
```

### AND(condition1, condition2, ...)

Returns `true` if all conditions are true.

**Example:**
```
AND(Revenue[Q1] > 1000, ROE[Q1] > 0.15, Debt[Q1] < 0.5)
```

### OR(condition1, condition2, ...)

Returns `true` if any condition is true.

**Example:**
```
OR(Revenue[Q1] > 1000, Revenue[Q2] > 1000)
```

### NOT(condition)

Returns the opposite of the condition.

**Example:**
```
NOT(Debt[Q1] > 0.5)
```

### ISNUMBER(value)

Returns `true` if the value is a number.

**Example:**
```
ISNUMBER(Revenue[Q1])
```

### ISBLANK(value)

Returns `true` if the value is null, undefined, or empty string.

**Example:**
```
ISBLANK(Revenue[Q1])
IF(ISBLANK(Revenue[Q1]), 0, Revenue[Q1])
```

## Math Functions

### SUM(value1, value2, ...)

Sums all numeric values.

**Example:**
```
SUM(Revenue[Q1], Revenue[Q2], Revenue[Q3])
```

### AVERAGE(value1, value2, ...)

Calculates the average of all numeric values.

**Example:**
```
AVERAGE(Revenue[Q1], Revenue[Q2], Revenue[Q3])
```

### MAX(value1, value2, ...)

Returns the maximum value.

**Example:**
```
MAX(Revenue[Q1], Revenue[Q2], Revenue[Q3])
```

### MIN(value1, value2, ...)

Returns the minimum value.

**Example:**
```
MIN(Revenue[Q1], Revenue[Q2], Revenue[Q3])
```

### COUNT(value1, value2, ...)

Counts the number of non-null values.

**Example:**
```
COUNT(Revenue[Q1], Revenue[Q2], Revenue[Q3])
```

### ROUND(number, digits)

Rounds a number to the specified number of decimal places.

**Example:**
```
ROUND(Revenue[Q1] / 1000, 2)  // Round to 2 decimal places
```

### ROUNDUP(number, digits)

Rounds a number up to the specified number of decimal places.

**Example:**
```
ROUNDUP(Revenue[Q1] / 1000, 2)
```

### ROUNDDOWN(number, digits)

Rounds a number down to the specified number of decimal places.

**Example:**
```
ROUNDDOWN(Revenue[Q1] / 1000, 2)
```

### ABS(number)

Returns the absolute value of a number.

**Example:**
```
ABS(Revenue[Q1] - Revenue[Q2])  // Absolute difference
```

### SQRT(number)

Returns the square root of a number.

**Example:**
```
SQRT(Revenue[Q1])
```

### POWER(base, exponent)

Raises a number to a power.

**Example:**
```
POWER(Revenue[Q1], 2)  // Revenue squared
POWER(2, 3)           // 2^3 = 8
```

### LOG(number, base?)

Returns the logarithm of a number. Base defaults to 10 if not specified.

**Example:**
```
LOG(100)        // Log base 10 of 100 = 2
LOG(8, 2)       // Log base 2 of 8 = 3
```

### CEILING(number, significance?)

Rounds a number up to the nearest multiple of significance. Default significance is 1.

**Example:**
```
CEILING(Revenue[Q1], 100)  // Round up to nearest 100
CEILING(2.3, 1)            // 3
```

### FLOOR(number, significance?)

Rounds a number down to the nearest multiple of significance. Default significance is 1.

**Example:**
```
FLOOR(Revenue[Q1], 100)  // Round down to nearest 100
FLOOR(2.7, 1)            // 2
```

## Text Functions

### TRIM(text)

Removes leading and trailing spaces from text.

**Example:**
```
TRIM("  Revenue  ")  // Returns "Revenue"
```

### CONCAT(text1, text2, ...) / CONCATENATE(text1, text2, ...)

Concatenates multiple text values or numbers into a single string.

**Example:**
```
CONCAT("Revenue: ", Revenue[Q1])
CONCATENATE("Q1: ", Revenue[Q1], ", Q2: ", Revenue[Q2])
```

## Error Handling Functions

### IFERROR(value, error_value)

Returns `error_value` if `value` is null, undefined, or NaN. Otherwise returns `value`.

**Example:**
```
IFERROR(Revenue[Q1] / 0, 0)  // Returns 0 if division by zero
IFERROR(Revenue[Q1] / Revenue[Q2], 1)  // Returns 1 if Q2 is 0
```

### NOTNULL(value, alternative?)

Returns `value` if it's not null, otherwise returns `alternative` (or null if not provided).

**Example:**
```
NOTNULL(Revenue[Q1], 0)  // Returns 0 if Revenue[Q1] is null
```

### COALESCE(value1, value2, ...)

Returns the first non-null value from the list.

**Example:**
```
COALESCE(Revenue[Q1], Revenue[Q2], Revenue[Q3], 0)
```

## Conditional Aggregation Functions

### SUMIF(range, criteria, sum_range?)

Sums values in `sum_range` (or `range` if not provided) where values in `range` match the criteria.

**Criteria formats:**
- `">10"` - Greater than 10
- `"<5"` - Less than 5
- `">=10"` - Greater than or equal to 10
- `"<=5"` - Less than or equal to 5
- `"=value"` - Equal to value
- `"<>value"` - Not equal to value
- Direct value - Exact match

**Example:**
```
SUMIF(Revenue[Q1], ">1000", Revenue[Q1])
SUMIF(ROE[Q1], ">0.15", Revenue[Q1])
```

### COUNTIF(range, criteria)

Counts the number of values in `range` that match the criteria.

**Example:**
```
COUNTIF(Revenue[Q1], ">1000")
COUNTIF(ROE[Q1], ">0.15")
```

## Common Patterns

### Growth Calculation

```
(Revenue[Q1] - Revenue[Q2]) / Revenue[Q2]
```

### Year-over-Year Growth

```
(Revenue[Q1] - Revenue[Q5]) / Revenue[Q5]
```

### Moving Average

```
AVERAGE(Revenue[Q1], Revenue[Q2], Revenue[Q3], Revenue[Q4])
```

### Conditional Signal with Multiple Criteria

```
IF(AND(ROE[Q1] > 0.15, Debt[Q1] < 0.5, Revenue[Q1] > Revenue[Q2]), "BUY", "HOLD")
```

### Safe Division

```
IFERROR(Revenue[Q1] / Revenue[Q2], 0)
```

### Handling Missing Data

```
IF(ISBLANK(Revenue[Q1]), AVERAGE(Revenue[Q2], Revenue[Q3]), Revenue[Q1])
```

### Percentage Change

```
(Revenue[Q1] - Revenue[Q2]) / Revenue[Q2] * 100
```

### Complex Multi-Quarter Analysis

```
IF(AND(
  Revenue[Q1] > Revenue[Q2],
  Revenue[Q2] > Revenue[Q3],
  ROE[Q1] > 0.15
), "STRONG BUY", "HOLD")
```

## Troubleshooting

### Formula Returns Null

- Check that all metric names are spelled correctly
- Verify that the quarter indices (Q1, Q2, etc.) are valid
- Ensure all referenced metrics exist in the quarterly data

### Division by Zero Errors

Use `IFERROR()` to handle division by zero:

```
IFERROR(Revenue[Q1] / Revenue[Q2], 0)
```

### Missing Metrics

Use `ISBLANK()` or `COALESCE()` to handle missing data:

```
IF(ISBLANK(Revenue[Q1]), 0, Revenue[Q1])
COALESCE(Revenue[Q1], Revenue[Q2], 0)
```

### Incorrect Results

- Verify operator precedence (use parentheses to clarify)
- Check that numeric values are being compared correctly
- Ensure percentage values are in the correct format (decimals vs percentages)

### Function Not Recognized

- Ensure function names are spelled correctly (case-insensitive)
- Check that the function is supported (see function list above)
- Verify function syntax matches the documentation

## Tips

1. **Use Parentheses**: When in doubt, use parentheses to clarify operator precedence
2. **Test Incrementally**: Build complex formulas step by step
3. **Use Preview**: Use the preview feature to test formulas before saving
4. **Handle Errors**: Always use `IFERROR()` or `ISBLANK()` for potentially missing data
5. **Document Complex Formulas**: Add comments in formula names or descriptions

## Function Quick Reference

| Function | Category | Arguments | Description |
|----------|-----------|-----------|-------------|
| IF | Logical | 3 | Conditional statement |
| AND | Logical | 2+ | All conditions true |
| OR | Logical | 2+ | Any condition true |
| NOT | Logical | 1 | Negate condition |
| ISNUMBER | Logical | 1 | Check if number |
| ISBLANK | Logical | 1 | Check if blank |
| SUM | Math | 2+ | Sum values |
| AVERAGE | Math | 2+ | Average values |
| MAX | Math | 2+ | Maximum value |
| MIN | Math | 2+ | Minimum value |
| COUNT | Math | 1+ | Count values |
| ROUND | Math | 2 | Round number |
| ROUNDUP | Math | 2 | Round up |
| ROUNDDOWN | Math | 2 | Round down |
| ABS | Math | 1 | Absolute value |
| SQRT | Math | 1 | Square root |
| POWER | Math | 2 | Power/exponentiation |
| LOG | Math | 1-2 | Logarithm |
| CEILING | Math | 1-2 | Round up to multiple |
| FLOOR | Math | 1-2 | Round down to multiple |
| TRIM | Text | 1 | Remove spaces |
| CONCAT | Text | 2+ | Concatenate strings |
| CONCATENATE | Text | 2+ | Concatenate strings |
| IFERROR | Error | 2 | Handle errors |
| NOTNULL | Error | 1-2 | Return if not null |
| COALESCE | Error | 2+ | First non-null |
| SUMIF | Conditional | 2-3 | Sum with criteria |
| COUNTIF | Conditional | 2 | Count with criteria |

