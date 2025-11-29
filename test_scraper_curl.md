# Testing Scraper API with curl

This document shows how to test the scraper API endpoints using curl.

## Prerequisites

1. Server must be running: `cd ShadcnExplore && npm run dev`
2. You need an authentication token (JWT)

## Step 1: Login to get a token

```bash
curl -X POST "http://localhost:5002/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

Response will include a `token` field. Save this token.

## Step 2: Test Company Metadata API (Same as Bulk Import)

This endpoint uses `fetchCompanyMetadata` which is the same API used in bulk import:

```bash
# Replace YOUR_TOKEN with the token from Step 1
# Replace TCS with any ticker you want to test

curl -X GET "http://localhost:5002/api/v1/companies/metadata/TCS" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -v
```

Expected response:
```json
{
  "ticker": "TCS",
  "companyName": "Tata Consultancy Services Ltd",
  "detectedSector": "IT - Services",
  "exists": true
}
```

## Step 3: Test Single Company Scrape

This endpoint now uses `fetchCompanyMetadata` first (same as bulk import), then scrapes the full page:

```bash
# Replace YOUR_TOKEN with the token from Step 1
# Replace TCS with any ticker you want to test

curl -X POST "http://localhost:5002/api/v1/scraper/scrape/single" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "TCS",
    "sectorId": null
  }' \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -v
```

Expected response (success):
```json
{
  "success": true,
  "ticker": "TCS",
  "companyName": "Tata Consultancy Services Ltd",
  "sector": "IT - Services",
  "quartersScraped": 8,
  "metricsScraped": 45
}
```

Expected response (company not found):
```json
{
  "success": false,
  "ticker": "INVALID",
  "quartersScraped": 0,
  "metricsScraped": 0,
  "error": "Company not found on Screener.in"
}
```

## Step 4: Check Server Logs

The scraper now includes detailed logging. Watch the server console for:

- `[SCRAPER] Starting scrape for ticker: ...`
- `[SCRAPER] Fetching company metadata using fetchCompanyMetadata API (same as bulk import)...`
- `[SCRAPER] Metadata fetch completed in ...ms`
- `[SCRAPER] Fetching full company page URL: ...`
- `[SCRAPER] HTTP Response: ...`
- `[SCRAPER] Extracted X quarterly data rows...`
- `[SCRAPER] ✅ Scrape completed successfully...`

## Testing Different Scenarios

### Test with invalid ticker:
```bash
curl -X POST "http://localhost:5002/api/v1/scraper/scrape/single" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticker": "INVALIDTICKER123"}' \
  -v
```

### Test with valid ticker but no quarterly data:
```bash
curl -X POST "http://localhost:5002/api/v1/scraper/scrape/single" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticker": "STARHEALTH"}' \
  -v
```

### Test with sector override:
```bash
# First, get a sector ID from /api/sectors
# Then use it in the request

curl -X POST "http://localhost:5002/api/v1/scraper/scrape/single" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "TCS",
    "sectorId": "your-sector-id-here"
  }' \
  -v
```

## Notes

- The scraper now uses `fetchCompanyMetadata` first (same API as bulk import CSV)
- This validates the company exists before attempting full scrape
- All requests are logged with `[SCRAPER]` prefix for easy filtering
- Rate limiting delay is 2-5 seconds between requests

