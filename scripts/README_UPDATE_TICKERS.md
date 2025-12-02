# CSV Ticker Updater Script

This script updates ticker symbols in a CSV file by validating them against Screener.in and searching for correct tickers when needed.

## Features

- ✅ **Rate Limiting**: Automatic delays between requests to avoid IP blocking
- 🔄 **Retry Logic**: Automatic retries with exponential backoff on failures
- 📊 **Progress Tracking**: Real-time progress updates with detailed statistics
- 🛡️ **Error Handling**: Robust error handling with detailed logging
- ⏸️ **Resume Capability**: Can resume from a specific index if interrupted
- 🔍 **Fuzzy Matching**: Smart company name matching to verify tickers

## Usage

### Basic Usage

```bash
# Update all companies in the default CSV file
npm run update-csv-tickers

# Or with custom input/output paths
npm run update-csv-tickers input.csv output.csv
```

### Advanced Usage

```bash
# Verify only (don't search for new tickers)
npm run update-csv-tickers input.csv output.csv --verify-only

# Process only first 50 companies
npm run update-csv-tickers input.csv output.csv 50

# Resume from index 100
npm run update-csv-tickers input.csv output.csv --start-from=100

# Combine options: verify only, first 20 companies
npm run update-csv-tickers input.csv output.csv 20 --verify-only
```

### Direct Execution

```bash
# Using tsx directly
tsx scripts/update_csv_tickers.ts [input.csv] [output.csv] [maxCompanies] [--verify-only] [--start-from=N]
```

## Arguments

1. **input.csv** (optional): Input CSV file path. Default: `csv_export/companies_bulk_import_corrected.csv`
2. **output.csv** (optional): Output CSV file path. Default: `csv_export/companies_bulk_import_updated.csv`
3. **maxCompanies** (optional): Maximum number of companies to process
4. **--verify-only** or **-v**: Only verify existing tickers, don't search for new ones
5. **--start-from=N**: Start processing from index N (useful for resuming)

## CSV Format

The CSV file must have the following columns:
- `ticker`: Current ticker symbol
- `name`: Company name
- `sector`: Sector name

Example:
```csv
ticker,name,sector
RELIANCE,Reliance Industries Ltd,Refineries
TCS,Tata Consultancy Services,IT-Software
```

## How It Works

1. **Read CSV**: Parses the input CSV file
2. **Verify Ticker**: For each company, verifies if the current ticker is correct by:
   - Fetching company metadata from Screener.in
   - Comparing company names (fuzzy match)
3. **Search if Invalid**: If ticker is invalid and not in verify-only mode:
   - Searches Screener.in for the company by name
   - Updates ticker if found
4. **Write Results**: Writes updated CSV with corrected tickers

## Rate Limiting

The script includes built-in rate limiting:
- **Default delay**: 3 seconds between requests (with 0-2s random variance)
- **Rate limit detection**: Automatically detects 429/403 errors and waits longer
- **Retry logic**: Up to 3 retries with exponential backoff

## Error Handling

The script handles various error scenarios:
- **Network errors**: Automatic retries with delays
- **Rate limiting**: Extended wait times when detected
- **IP blocking**: Clear error messages and recommendations
- **Invalid tickers**: Logs errors and continues processing

## Output

The script provides:
- Real-time progress updates every 10 companies
- Detailed statistics at the end:
  - Total companies processed
  - Verified (ticker was correct)
  - Updated (ticker was corrected)
  - Failed (could not verify/update)
- List of failed companies with error messages

## Example Output

```
================================================================================
📊 CSV Ticker Updater
================================================================================
Input file: csv_export/companies_bulk_import_corrected.csv
Output file: csv_export/companies_bulk_import_updated.csv
Mode: Verify & Update
================================================================================

📖 Reading CSV file: csv_export/companies_bulk_import_corrected.csv
✅ Parsed 945 companies from CSV

[1/945] Processing: Carborundum Universal Ltd
  Current ticker: CU
  Sector: Abrasives Stocks
  🔍 Verifying ticker "CU" for "Carborundum Universal Ltd" (attempt 1/3)...
  ✅ Ticker verified: "CU" matches "Carborundum Universal Ltd"
  ✅ Status: VERIFIED (ticker is correct)
  ⏳ Waiting 3.0s before next request...

📈 Progress: 10/945 (1.1%)
   ✅ Verified: 8 | 🔄 Updated: 1 | ❌ Failed: 1

...

================================================================================
📊 Update Complete!
================================================================================
Total companies: 945
✅ Verified: 850
🔄 Updated: 80
❌ Failed: 15
⏱️  Duration: 2847.3s
📁 Output file: csv_export/companies_bulk_import_updated.csv
================================================================================
```

## Tips

1. **Start Small**: Test with a small number of companies first:
   ```bash
   npm run update-csv-tickers input.csv output.csv 10
   ```

2. **Verify Only Mode**: If you just want to check which tickers are wrong:
   ```bash
   npm run update-csv-tickers input.csv output.csv --verify-only
   ```

3. **Resume Processing**: If the script is interrupted, you can resume:
   ```bash
   npm run update-csv-tickers input.csv output.csv --start-from=100
   ```

4. **Monitor for Rate Limiting**: Watch for rate limit warnings and adjust delays if needed

## Configuration

You can modify the configuration constants in the script:
- `DELAY_BETWEEN_REQUESTS`: Base delay between requests (default: 3000ms)
- `DELAY_VARIANCE`: Random variance added to delay (default: 2000ms)
- `MAX_RETRIES`: Maximum retry attempts (default: 3)
- `RATE_LIMIT_DELAY`: Wait time when rate limited (default: 60000ms)

## Troubleshooting

### IP Blocking
If you see IP blocking errors:
- Wait 1-2 hours before retrying
- Reduce the number of companies processed at once
- Increase `DELAY_BETWEEN_REQUESTS` in the script

### Too Many Failures
- Check your internet connection
- Verify Screener.in is accessible
- Try processing in smaller batches

### Script Hangs
- Check if Screener.in is down
- Verify network connectivity
- Look for rate limiting messages in the output

