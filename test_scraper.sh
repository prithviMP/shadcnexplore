#!/bin/bash

# Test script for scraper API
# This script tests the scraper endpoint using curl

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:5002}"
TICKER="${1:-TCS}"

echo -e "${YELLOW}Testing Scraper API${NC}"
echo "===================="
echo "Base URL: $BASE_URL"
echo "Ticker: $TICKER"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: Server is not running at $BASE_URL${NC}"
    echo "Please start the server first:"
    echo "  cd ShadcnExplore && npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Note: You'll need to authenticate first to get a token
# For now, this shows the curl command structure
echo -e "${YELLOW}To test the scraper, you need to:${NC}"
echo "1. Login first to get an auth token"
echo "2. Use that token in the Authorization header"
echo ""
echo -e "${YELLOW}Step 1: Login to get token${NC}"
echo ""
cat << EOF
curl -X POST "$BASE_URL/api/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
EOF
echo ""
echo ""
echo -e "${YELLOW}Step 2: Test Company Metadata API (same as bulk import)${NC}"
echo ""
cat << EOF
curl -X GET "$BASE_URL/api/v1/companies/metadata/$TICKER" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \\
  -v
EOF
echo ""
echo ""
echo -e "${YELLOW}Step 3: Test Single Company Scrape (uses fetchCompanyMetadata first)${NC}"
echo ""
cat << EOF
curl -X POST "$BASE_URL/api/v1/scraper/scrape/single" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "ticker": "$TICKER",
    "sectorId": null
  }' \\
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \\
  -v
EOF

echo ""
echo ""
echo -e "${GREEN}Test script ready!${NC}"
echo "Make sure to replace YOUR_TOKEN with an actual JWT token from login."
echo ""
echo -e "${YELLOW}Note: The scraper now uses fetchCompanyMetadata API first (same as bulk import)${NC}"
echo "This validates the company exists before attempting full scrape."
