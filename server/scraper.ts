/**
 * Screener.in Web Scraper for Indian Companies
 * Enhanced scraper matching Python implementation
 * Scrapes quarterly financial data from Screener.in
 */

import { load } from "cheerio";
import { storage } from "./storage";
import type { InsertQuarterlyData, InsertScrapingLog } from "@shared/schema";

interface ScrapeResult {
  success: boolean;
  ticker: string;
  companyName?: string;
  sector?: string;
  quartersScraped: number;
  metricsScraped: number;
  error?: string;
}

interface ScrapeStatus {
  isRunning: boolean;
  currentTicker?: string;
  totalTickers?: number;
  completedTickers?: number;
  startTime?: Date;
  lastUpdate?: Date;
}

class ScreenerScraper {
  private status: ScrapeStatus = {
    isRunning: false,
  };

  private readonly USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
  ];

  private getRandomUserAgent(): string {
    return this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    let lastError: any;

    for (let i = 0; i < retries; i++) {
      try {
        const headers = {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.screener.in/',
          ...options.headers,
        };

        const response = await fetch(url, {
          ...options,
          headers,
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000 * (i + 1);
          console.log(`[SCRAPER] Rate limited. Waiting ${waitTime}ms before retry ${i + 1}/${retries}`);
          await this.delay(waitTime);
          continue;
        }

        if (response.status >= 500) {
          console.log(`[SCRAPER] Server error ${response.status}. Retrying ${i + 1}/${retries}`);
          await this.delay(2000 * (i + 1));
          continue;
        }

        return response;
      } catch (error: any) {
        lastError = error;
        if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
          console.error(`[SCRAPER] Connection refused. Retrying ${i + 1}/${retries}`);
          await this.delay(3000 * (i + 1));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Search for ticker by company name using Screener.in API
   */
  async searchTickerByCompanyName(companyName: string): Promise<{ ticker: string; companyName: string; detectedSector: string; exists: boolean } | null> {
    // Screener.in search API - using the internal API endpoint
    const searchUrl = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(companyName)}&v=3&fts=1`;

    try {
      const response = await this.fetchWithRetry(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        } as any, // Cast to any to avoid strict type checking issues with HeadersInit
      });

      if (!response.ok) {
        // If API doesn't work, try scraping the search page
        return await this.searchTickerByScraping(companyName);
      }

      const data = await response.json();

      // The API returns an array of results with structure: { id, name, url }
      // Example: { "id": 2726, "name": "Reliance Industries Ltd", "url": "/company/RELIANCE/consolidated/" }
      if (Array.isArray(data) && data.length > 0) {
        // Filter out the "Search everywhere" entry (has null id)
        const validResults = data.filter((item: any) => item.id !== null && item.url);

        if (validResults.length === 0) {
          return await this.searchTickerByScraping(companyName);
        }

        // Find the best match (exact or closest match)
        const bestMatch = validResults.find((item: any) => {
          const itemName = (item.name || '').toLowerCase();
          const searchName = companyName.toLowerCase();
          return itemName === searchName ||
            itemName.includes(searchName) ||
            searchName.includes(itemName);
        }) || validResults[0];

        // Extract ticker from url (format: /company/TICKER/consolidated/ or /company/TICKER/)
        let ticker = '';
        if (bestMatch.url) {
          // Extract ticker from URL like "/company/RELIANCE/consolidated/" or "/company/RELIANCE/"
          const urlMatch = bestMatch.url.match(/\/company\/([^\/]+)/);
          if (urlMatch && urlMatch[1]) {
            ticker = urlMatch[1].toUpperCase();
          }
        }

        if (ticker) {
          // Fetch full metadata using the found ticker
          const metadata = await this.fetchCompanyMetadata(ticker);
          return metadata;
        }
      }

      // Fallback to scraping if API doesn't return results
      return await this.searchTickerByScraping(companyName);
    } catch (error: any) {
      console.error(`Error searching for ticker by company name "${companyName}":`, error);
      // Fallback to scraping
      return await this.searchTickerByScraping(companyName);
    }
  }

  /**
   * Fallback: Search for ticker by scraping the search page
   */
  private async searchTickerByScraping(companyName: string): Promise<{ ticker: string; companyName: string; detectedSector: string; exists: boolean } | null> {
    const searchUrl = `https://www.screener.in/company/search/?q=${encodeURIComponent(companyName)}`;

    try {
      let response: Response;
      try {
        response = await this.fetchWithRetry(searchUrl);
      } catch (fetchError: any) {
        if (fetchError.code === 'ECONNREFUSED' || fetchError.message?.includes('ECONNREFUSED') ||
          fetchError.cause?.code === 'ECONNREFUSED') {
          console.error(`[SCRAPER] ⚠️ IP BLOCKING DETECTED in search: Connection refused`);
        }
        throw fetchError;
      }

      if (response.status === 403) {
        console.error(`[SCRAPER] ⚠️ IP BLOCKING DETECTED in search: HTTP 403 Forbidden`);
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const $ = load(html);

      // Look for company links in search results
      const firstResult = $('.company-result, .search-result, a[href*="/company/"]').first();
      const href = firstResult.attr('href') || '';

      if (href) {
        const tickerMatch = href.match(/\/company\/([^\/]+)/);
        if (tickerMatch && tickerMatch[1]) {
          const ticker = tickerMatch[1];
          return await this.fetchCompanyMetadata(ticker);
        }
      }

      return null;
    } catch (error: any) {
      console.error(`Error scraping search page for "${companyName}":`, error);
      return null;
    }
  }

  /**
   * Merge quarterly data from consolidated and standalone sources
   * Consolidated data takes precedence (overwrites standalone for same quarter+metric)
   * Standalone data fills in gaps (quarters/metrics not in consolidated)
   */
  private mergeQuarterlyData(
    consolidated: InsertQuarterlyData[],
    standalone: InsertQuarterlyData[]
  ): InsertQuarterlyData[] {
    // Create a map for consolidated data: key = quarter+metricName+scrapeTimestamp
    const consolidatedMap = new Map<string, InsertQuarterlyData>();
    consolidated.forEach(item => {
      const key = `${item.quarter}|${item.metricName}|${item.scrapeTimestamp?.getTime() || 'null'}`;
      consolidatedMap.set(key, item);
    });

    // Add standalone data, but don't overwrite consolidated
    const merged: InsertQuarterlyData[] = [...consolidated];
    const seenKeys = new Set(consolidatedMap.keys());

    standalone.forEach(item => {
      const key = `${item.quarter}|${item.metricName}|${item.scrapeTimestamp?.getTime() || 'null'}`;
      if (!seenKeys.has(key)) {
        merged.push(item);
        seenKeys.add(key);
      } else {
        // Log if we're skipping standalone data that's already in consolidated
        console.log(`[SCRAPER] Skipping standalone duplicate: ${item.quarter} - ${item.metricName} (already in consolidated)`);
      }
    });

    return merged;
  }

  /**
   * Fetch company metadata (name and sector) without full scraping
   */
  async fetchCompanyMetadata(ticker: string): Promise<{ ticker: string; companyName: string; detectedSector: string; exists: boolean }> {
    const url = `https://www.screener.in/company/${ticker}/consolidated/#quarters`;

    try {
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        return {
          ticker,
          companyName: '',
          detectedSector: '',
          exists: false,
        };
      }

      const html = await response.text();
      const $ = load(html);

      const companyName = this.extractCompanyName($);
      const detectedSector = this.extractSector($, ticker);

      return {
        ticker,
        companyName,
        detectedSector,
        exists: companyName !== 'Unknown Company',
      };
    } catch (error: any) {
      // Check for IP blocking in metadata fetch
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED') ||
        error.cause?.code === 'ECONNREFUSED') {
        console.error(`[SCRAPER] ⚠️ IP BLOCKING DETECTED in metadata fetch: Connection refused`);
        console.error(`[SCRAPER] Error details:`, {
          code: error.code || error.cause?.code,
          message: error.message,
        });
      }
      console.error(`Error fetching metadata for ${ticker}:`, error);
      return {
        ticker,
        companyName: '',
        detectedSector: '',
        exists: false,
      };
    }
  }

  /**
   * Scrape quarterly data for a single company
   * @param dataType - 'consolidated' (default), 'standalone', or 'both' to merge data from both sources
   */
  async scrapeCompany(ticker: string, companyId?: string, sectorOverride?: string, userId?: string, dataType: 'consolidated' | 'standalone' | 'both' = 'consolidated'): Promise<ScrapeResult> {
    // Primary URL: consolidated quarterly data (preferred)
    let url = `https://www.screener.in/company/${ticker}/consolidated/#quarters`;
    const fallbackUrl = `https://www.screener.in/company/${ticker}/#quarters`;
    // Track where we finally loaded quarterly data from for better observability
    let quarterlyDataSource: 'primary' | 'fallback' | 'none' = 'none';
    const startedAt = new Date();
    let logId: string | null = null;

      console.log(`[SCRAPER] Starting scrape for ticker: ${ticker.toUpperCase()}`);
      console.log(`[SCRAPER] Primary URL: ${url}`);
      console.log(`[SCRAPER] Fallback URL: ${fallbackUrl}`);
    console.log(`[SCRAPER] Parameters: companyId=${companyId || 'none'}, sectorOverride=${sectorOverride || 'none'}, userId=${userId || 'none'}`);

    try {
      // Create initial scraping log
      const log: InsertScrapingLog = {
        ticker: ticker.toUpperCase(),
        companyId: companyId || null,
        sectorId: null, // Will be updated after scraping
        userId: userId || null, // Track who triggered the scrape
        status: 'success',
        quartersScraped: 0,
        metricsScraped: 0,
        startedAt,
      };
      const createdLog = await storage.createScrapingLog(log);
      logId = createdLog.id;
      console.log(`[SCRAPER] Created scraping log with ID: ${logId}`);

      // First, fetch company metadata using the same API as bulk import
      console.log(`[SCRAPER] Fetching company metadata using fetchCompanyMetadata API (same as bulk import)...`);
      const metadataStartTime = Date.now();
      const metadata = await this.fetchCompanyMetadata(ticker);
      const metadataDuration = Date.now() - metadataStartTime;
      console.log(`[SCRAPER] Metadata fetch completed in ${metadataDuration}ms:`, {
        exists: metadata.exists,
        companyName: metadata.companyName,
        detectedSector: metadata.detectedSector,
      });

      if (!metadata.exists) {
        console.warn(`[SCRAPER] Company not found for ticker: ${ticker}`);
        // Update log with failure
        if (logId) {
          await storage.updateScrapingLog(logId, {
            status: 'failed',
            quartersScraped: 0,
            metricsScraped: 0,
            error: "Company not found on Screener.in",
            completedAt: new Date(),
          });
        }
        return {
          success: false,
          ticker,
          quartersScraped: 0,
          metricsScraped: 0,
          error: "Company not found on Screener.in",
        };
      }

      // Add delay to avoid rate limiting (2-5 seconds, matching Python)
      const delayMs = Math.random() * 3000 + 2000;
      console.log(`[SCRAPER] Waiting ${Math.round(delayMs)}ms before fetching full page to avoid rate limiting...`);
      await this.delay(delayMs);

      console.log(`[SCRAPER] Fetching full company page URL (primary): ${url}`);
      const fetchStartTime = Date.now();
      let response: Response;
      try {
        response = await this.fetchWithRetry(url);
      } catch (fetchError: any) {
        // Check for connection refused errors (IP blocking)
        if (fetchError.code === 'ECONNREFUSED' || fetchError.message?.includes('ECONNREFUSED') ||
          fetchError.cause?.code === 'ECONNREFUSED') {
          console.error(`[SCRAPER] ⚠️ IP BLOCKING DETECTED: Connection refused (ECONNREFUSED)`);
          console.error(`[SCRAPER] This likely means your IP address has been blocked by Screener.in`);
          console.error(`[SCRAPER] Error details:`, {
            code: fetchError.code || fetchError.cause?.code,
            message: fetchError.message,
            cause: fetchError.cause,
          });
          throw new Error(`IP_BLOCKED: Connection refused - Your IP may be blocked by Screener.in. Error: ${fetchError.message}`);
        }
        // Re-throw other fetch errors
        throw fetchError;
      }

      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`[SCRAPER] HTTP Response: ${response.status} ${response.statusText} (took ${fetchDuration}ms)`);
      console.log(`[SCRAPER] Response headers:`, {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
        'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
        'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
        'retry-after': response.headers.get('retry-after'),
      });

      // Check for HTTP status codes that indicate blocking
      if (response.status === 403) {
        console.error(`[SCRAPER] ⚠️ IP BLOCKING DETECTED: HTTP 403 Forbidden`);
        const bodyText = await response.text().catch(() => '');
        console.error(`[SCRAPER] Response body (first 500 chars):`, bodyText.substring(0, 500));
        throw new Error(`IP_BLOCKED: HTTP 403 Forbidden - Your IP may be blocked by Screener.in`);
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        console.error(`[SCRAPER] ⚠️ RATE LIMIT DETECTED: HTTP 429 Too Many Requests`);
        console.error(`[SCRAPER] Retry-After header: ${retryAfter || 'not provided'}`);
        throw new Error(`RATE_LIMITED: HTTP 429 Too Many Requests. Retry after: ${retryAfter || 'unknown'}`);
      }

      if (!response.ok) {
        console.error(`[SCRAPER] HTTP Error: ${response.status} ${response.statusText}`);
        // Try to get response body for more context
        try {
          const bodyText = await response.text();
          if (bodyText.toLowerCase().includes('blocked') || bodyText.toLowerCase().includes('forbidden') ||
            bodyText.toLowerCase().includes('access denied')) {
            console.error(`[SCRAPER] ⚠️ BLOCKING DETECTED in response body`);
            throw new Error(`IP_BLOCKED: HTTP ${response.status} - Blocking detected in response`);
          }
        } catch (e) {
          // Ignore errors reading body
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const htmlStartTime = Date.now();
      const html = await response.text();
      const htmlDuration = Date.now() - htmlStartTime;
      console.log(`[SCRAPER] Received HTML (${html.length} bytes) in ${htmlDuration}ms`);

      const parseStartTime = Date.now();
      const $ = load(html);
      const parseDuration = Date.now() - parseStartTime;
      console.log(`[SCRAPER] Parsed HTML with Cheerio in ${parseDuration}ms`);

      // Use metadata from fetchCompanyMetadata (same as bulk import)
      const companyName = metadata.companyName;
      console.log(`[SCRAPER] Using company name from metadata: ${companyName}`);

      // Check if company already exists
      let existingCompany = companyId ? await storage.getCompany(companyId) : null;
      if (!existingCompany) {
        // Try to find by ticker (but we need sectorId to get the right one if multiple exist)
        // For now, just get first match - caller should provide companyId if there are multiple
        existingCompany = await storage.getCompanyByTicker(ticker);
      }
      console.log(`[SCRAPER] Existing company: ${existingCompany ? `Found (ID: ${existingCompany.id}, Sector: ${existingCompany.sectorId || 'none'})` : 'Not found'}`);

      // Priority: Use sectorOverride (user-provided) if available
      // If company exists with a sector, NEVER update it from scraped data
      let sectorName: string;

      if (sectorOverride) {
        // User provided sector - use it
        sectorName = sectorOverride;
        console.log(`[SCRAPER] Using user-provided sector: ${sectorName}`);
      } else if (existingCompany?.sectorId) {
        // Company exists with a sector - use it, NEVER update from scraped data
        const sector = await storage.getSector(existingCompany.sectorId);
        sectorName = sector?.name || "Unknown";
        console.log(`[SCRAPER] Using existing company sector: ${sectorName}`);
      } else {
        // No existing company or no sector - use detected sector from metadata (same as bulk import)
        sectorName = metadata.detectedSector || "Unknown";
        console.log(`[SCRAPER] Using detected sector from metadata: ${sectorName}`);
      }

      // Get or create company first to ensure we have companyId
      let finalCompanyId = companyId || existingCompany?.id;
      if (!finalCompanyId && companyName) {
        // Only create new company if it doesn't exist
        // Note: This will create with scraped sector, but only if no company exists
        let sectorRecord = await storage.getSectorByName(sectorName);
        if (!sectorRecord) {
          sectorRecord = await storage.createSector({
            name: sectorName,
            description: `Sector for ${sectorName} companies`,
          });
        }

        // Create company
        const newCompany = await storage.createCompany({
          ticker: ticker.toUpperCase(),
          name: companyName,
          sectorId: sectorRecord.id,
        });
        finalCompanyId = newCompany.id;
      }

      // Extract key financial metrics (P/E, ROCE, ROE, etc.)
      console.log(`[SCRAPER] Extracting key financial metrics...`);
      const keyMetrics = this.extractKeyMetrics($);
      console.log(`[SCRAPER] Extracted key metrics:`, Object.keys(keyMetrics).length > 0 ? Object.keys(keyMetrics).join(', ') : 'NONE');
      if (Object.keys(keyMetrics).length > 0) {
        console.log(`[SCRAPER] Key metrics details:`, keyMetrics);
      }

      // Extract quarterly data based on dataType preference
      let consolidatedData: InsertQuarterlyData[] = [];
      let standaloneData: InsertQuarterlyData[] = [];
      let quarterlyData: InsertQuarterlyData[] = [];

      // Try consolidated data if requested
      if (dataType === 'consolidated' || dataType === 'both') {
        console.log(`[SCRAPER] Extracting quarterly data from primary page (consolidated)...`);
        const extractStartTime = Date.now();
        consolidatedData = this.extractQuarterlyData($, ticker, finalCompanyId || undefined);
        const extractDuration = Date.now() - extractStartTime;
        console.log(`[SCRAPER] Extracted ${consolidatedData.length} quarterly data rows from consolidated page in ${extractDuration}ms`);
        if (consolidatedData.length > 0) {
          quarterlyDataSource = 'primary';
          if (dataType === 'consolidated') {
            quarterlyData = consolidatedData;
          }
        }
      }

      // Try standalone data if requested (and consolidated didn't work or both is requested)
      if ((dataType === 'standalone' || dataType === 'both') && (quarterlyData.length === 0 || dataType === 'both')) {
        try {
          if (dataType === 'both' && consolidatedData.length > 0) {
            console.log(`[SCRAPER] Fetching standalone data to merge with consolidated data...`);
          } else {
            console.log(`[SCRAPER] Trying standalone URL...`);
          }
          const fallbackDelayMs = Math.random() * 2000 + 1000;
          console.log(`[SCRAPER] Waiting ${Math.round(fallbackDelayMs)}ms before fetching standalone page to avoid rate limiting...`);
          await this.delay(fallbackDelayMs);

          const standaloneUrl = fallbackUrl;
          console.log(`[SCRAPER] Fetching standalone company page URL: ${standaloneUrl}`);
          const fallbackFetchStart = Date.now();
          const fallbackResponse = await this.fetchWithRetry(standaloneUrl);
          const fallbackFetchDuration = Date.now() - fallbackFetchStart;
          console.log(`[SCRAPER] Standalone HTTP Response: ${fallbackResponse.status} ${fallbackResponse.statusText} (took ${fallbackFetchDuration}ms)`);

          if (fallbackResponse.ok) {
            const fallbackHtmlStart = Date.now();
            const fallbackHtml = await fallbackResponse.text();
            const fallbackHtmlDuration = Date.now() - fallbackHtmlStart;
            console.log(`[SCRAPER] Received standalone HTML (${fallbackHtml.length} bytes) in ${fallbackHtmlDuration}ms`);

            const fallbackParseStart = Date.now();
            const fallback$ = load(fallbackHtml);
            const fallbackParseDuration = Date.now() - fallbackParseStart;
            console.log(`[SCRAPER] Parsed standalone HTML with Cheerio in ${fallbackParseDuration}ms`);

            console.log(`[SCRAPER] Extracting quarterly data from standalone page...`);
            const fallbackExtractStart = Date.now();
            standaloneData = this.extractQuarterlyData(fallback$, ticker, finalCompanyId || undefined);
            const standaloneExtractDuration = Date.now() - fallbackExtractStart;
            console.log(`[SCRAPER] Extracted ${standaloneData.length} quarterly data rows from standalone page in ${standaloneExtractDuration}ms`);
            
            if (standaloneData.length > 0) {
              if (dataType === 'both' && consolidatedData.length > 0) {
                // Merge data: consolidated takes precedence, standalone fills gaps
                console.log(`[SCRAPER] Merging consolidated and standalone data...`);
                quarterlyData = this.mergeQuarterlyData(consolidatedData, standaloneData);
                quarterlyDataSource = 'primary'; // Mark as primary since we have consolidated
                console.log(`[SCRAPER] Merged data: ${quarterlyData.length} total rows (${consolidatedData.length} consolidated + ${standaloneData.length} standalone, with deduplication)`);
              } else {
                quarterlyData = standaloneData;
                quarterlyDataSource = 'fallback';
              }
            }
          } else {
            console.warn(`[SCRAPER] Standalone URL returned non-OK status: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
          }
        } catch (fallbackError) {
          console.error(`[SCRAPER] Error while trying standalone URL for ${ticker}:`, fallbackError);
          // If both mode and we have consolidated data, use it
          if (dataType === 'both' && consolidatedData.length > 0) {
            quarterlyData = consolidatedData;
            quarterlyDataSource = 'primary';
            console.log(`[SCRAPER] Using consolidated data only (standalone fetch failed)`);
          }
        }
      }

      // If we still don't have data and only tried one type, try the other as fallback
      if (quarterlyData.length === 0 && dataType !== 'both') {
        console.log(`[SCRAPER] No data found with ${dataType} type, trying fallback...`);
        // Fallback logic: if consolidated failed, try standalone; if standalone failed, try consolidated
        try {
          const fallbackUrlToUse = dataType === 'consolidated' ? fallbackUrl : url;
          const fallbackType = dataType === 'consolidated' ? 'standalone' : 'consolidated';
          console.log(`[SCRAPER] Trying ${fallbackType} as fallback...`);
          const fallbackDelayMs = Math.random() * 2000 + 1000;
          await this.delay(fallbackDelayMs);
          const fallbackResponse = await this.fetchWithRetry(fallbackUrlToUse);
          if (fallbackResponse.ok) {
            const fallbackHtml = await fallbackResponse.text();
            const fallback$ = load(fallbackHtml);
            quarterlyData = this.extractQuarterlyData(fallback$, ticker, finalCompanyId || undefined);
            if (quarterlyData.length > 0) {
              quarterlyDataSource = fallbackType === 'standalone' ? 'fallback' : 'primary';
              console.log(`[SCRAPER] Successfully fetched ${quarterlyData.length} rows from ${fallbackType} fallback`);
            }
          }
        } catch (fallbackError) {
          console.error(`[SCRAPER] Fallback also failed:`, fallbackError);
        }
      }

      if (quarterlyData.length === 0) {
        console.warn(`[SCRAPER] No quarterly data found for ticker: ${ticker} on either primary or fallback URLs`);
        console.warn(`[SCRAPER] Company name: ${companyName || 'NOT FOUND'}`);
        console.warn(`[SCRAPER] Sector: ${sectorName || 'NOT FOUND'}`);
        return {
          success: false,
          ticker,
          companyName,
          sector: sectorName,
          quartersScraped: 0,
          metricsScraped: 0,
          error: "No quarterly data found",
        };
      }

      // Count unique quarters and metrics before storing
      const uniqueQuartersBefore = new Set(quarterlyData.map(d => d.quarter));
      const uniqueMetricsBefore = new Set(quarterlyData.map(d => d.metricName));
      console.log(`[SCRAPER] Quarterly data summary: ${uniqueQuartersBefore.size} unique quarters, ${uniqueMetricsBefore.size} unique metrics`);
      console.log(`[SCRAPER] Quarters found:`, Array.from(uniqueQuartersBefore).sort().join(', '));
      console.log(`[SCRAPER] Metrics found (first 20):`, Array.from(uniqueMetricsBefore).slice(0, 20).join(', '));
      console.log(`[SCRAPER] Quarterly data source for ${ticker}: ${quarterlyDataSource.toUpperCase()}`);

      // Store in database
      console.log(`[SCRAPER] Storing ${quarterlyData.length} quarterly data rows in database...`);
      const storeStartTime = Date.now();
      await storage.bulkCreateQuarterlyData(quarterlyData);
      const storeDuration = Date.now() - storeStartTime;
      console.log(`[SCRAPER] Stored quarterly data in database in ${storeDuration}ms`);

      // Update company with key metrics if we have a company record
      // NEVER update sector from scraped data if company already has a sector
      if (finalCompanyId && Object.keys(keyMetrics).length > 0) {
        const company = await storage.getCompany(finalCompanyId);
        if (company) {
          const currentFinancialData = (company.financialData as Record<string, any>) || {};
          const updatedFinancialData = { ...currentFinancialData, ...keyMetrics };

          // Also update marketCap if available
          const marketCap = keyMetrics.marketCap ? keyMetrics.marketCap.toString() : company.marketCap;

          // Only update sector if:
          // 1. User explicitly provided sectorOverride AND company doesn't have a sector yet
          // 2. OR company doesn't have a sector yet (company.sectorId is null/empty) AND we have scraped sector
          // NEVER update sector if company already has one (preserve user's choice)
          const updateData: any = {
            financialData: updatedFinancialData,
            marketCap: marketCap || company.marketCap,
          };

          // Only update sector if company has NO sector and user provided one OR we scraped one
          if (!company.sectorId) {
            if (sectorOverride) {
              // User provided sector and company has none - use it
              const sectorRecord = await storage.getSectorByName(sectorName);
              if (sectorRecord) {
                updateData.sectorId = sectorRecord.id;
              }
            } else if (sectorName && sectorName !== "Unknown") {
              // Company has no sector and we scraped one - use scraped sector (only for new companies)
              let sectorRecord = await storage.getSectorByName(sectorName);
              if (!sectorRecord) {
                sectorRecord = await storage.createSector({
                  name: sectorName,
                  description: `Sector for ${sectorName} companies`,
                });
              }
              updateData.sectorId = sectorRecord.id;
            }
          }
          // If company.sectorId exists, we NEVER update it - preserve user's choice

          await storage.updateCompany(company.id, updateData);
          
          // Trigger signal recalculation for this company in the background
          if (finalCompanyId) {
            const { signalProcessor } = await import("./signalProcessor");
            signalProcessor.enqueueJob("company", [finalCompanyId]).catch((error) => {
              console.error(`[SCRAPER] Failed to queue signal recalculation for ${ticker}:`, error);
            });
          }
        }
      }

      // Count unique quarters and metrics
      const uniqueQuarters = new Set(quarterlyData.map(d => d.quarter));
      const uniqueMetrics = new Set(quarterlyData.map(d => d.metricName));
      console.log(`[SCRAPER] Final counts: ${uniqueQuarters.size} quarters, ${uniqueMetrics.size} metrics`);
      console.log(`[SCRAPER] Data source for stored quarterly data: ${quarterlyDataSource.toUpperCase()}`);

      // Get sector ID for logging
      let sectorIdForLog = null;
      if (finalCompanyId) {
        const company = await storage.getCompanyByTicker(ticker);
        sectorIdForLog = company?.sectorId || null;
      }

      // Update scraping log with success
      if (logId) {
        try {
          console.log(`[SCRAPER] Updating scraping log ${logId} with success status...`);
          await storage.updateScrapingLog(logId, {
            companyId: finalCompanyId || null,
            sectorId: sectorIdForLog,
            status: 'success',
            quartersScraped: uniqueQuarters.size,
            metricsScraped: uniqueMetrics.size,
            completedAt: new Date(),
          });
          console.log(`[SCRAPER] Scraping log updated successfully`);
        } catch (e) {
          // If update fails, log error but continue
          console.error(`[SCRAPER] Error updating scraping log:`, e);
        }
      }

      const totalDuration = Date.now() - startedAt.getTime();
      console.log(`[SCRAPER] ✅ Scrape completed successfully for ${ticker} in ${totalDuration}ms`);
      console.log(`[SCRAPER] Summary: ${uniqueQuarters.size} quarters, ${uniqueMetrics.size} metrics, Company: ${companyName}, Sector: ${sectorName}`);

      return {
        success: true,
        ticker,
        companyName,
        sector: sectorName,
        quartersScraped: uniqueQuarters.size,
        metricsScraped: uniqueMetrics.size,
      };
    } catch (error: any) {
      const errorDuration = Date.now() - startedAt.getTime();
      console.error(`[SCRAPER] ❌ Error scraping ${ticker} after ${errorDuration}ms:`, error);

      // Enhanced error detection for IP blocking
      const isIPBlocked =
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('IP_BLOCKED') ||
        error.cause?.code === 'ECONNREFUSED' ||
        error.message?.includes('403') ||
        error.message?.includes('Forbidden') ||
        error.message?.includes('RATE_LIMITED');

      if (isIPBlocked) {
        console.error(`[SCRAPER] ⚠️⚠️⚠️ IP BLOCKING DETECTED ⚠️⚠️⚠️`);
        console.error(`[SCRAPER] Your IP address appears to be blocked by Screener.in`);
        console.error(`[SCRAPER] This could be due to:`);
        console.error(`[SCRAPER]   - Too many requests in a short time`);
        console.error(`[SCRAPER]   - Automated scraping detected`);
        console.error(`[SCRAPER]   - IP address blacklisted`);
        console.error(`[SCRAPER] Recommended actions:`);
        console.error(`[SCRAPER]   - Wait 1-2 hours before retrying`);
        console.error(`[SCRAPER]   - Use a VPN or proxy`);
        console.error(`[SCRAPER]   - Reduce scraping frequency`);
        console.error(`[SCRAPER]   - Contact Screener.in support if legitimate use`);
      }

      console.error(`[SCRAPER] Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code || error.cause?.code,
        url: url,
        isIPBlocked: isIPBlocked,
      });

      // Update scraping log with failure
      if (logId) {
        try {
          console.log(`[SCRAPER] Updating scraping log ${logId} with failure status...`);
          await storage.updateScrapingLog(logId, {
            status: 'failed',
            quartersScraped: 0,
            metricsScraped: 0,
            error: error.message || "Unknown error",
            completedAt: new Date(),
          });
          console.log(`[SCRAPER] Scraping log updated with failure`);
        } catch (logError) {
          console.error(`[SCRAPER] Error updating scraping log:`, logError);
        }
      }

      return {
        success: false,
        ticker,
        quartersScraped: 0,
        metricsScraped: 0,
        error: error.message || "Unknown error",
      };
    }
  }

  /**
   * Extract company name from the page
   */
  private extractCompanyName($: ReturnType<typeof load>): string {
    try {
      console.log(`[SCRAPER] [extractCompanyName] Starting company name extraction...`);
      
      // Try to find the company name in the main heading
      // Look for h1 tag first (most reliable)
      const h1Element = $('h1').first();
      if (h1Element.length > 0) {
        let h1Text = h1Element.text().trim();
        if (h1Text) {
          console.log(`[SCRAPER] [extractCompanyName] Found h1 text: ${h1Text.substring(0, 100)}`);
          
          // Clean up the name - remove common suffixes/prefixes
          if (h1Text.toLowerCase().includes('share price')) {
            h1Text = h1Text.split('share price')[0].trim();
          }
          if (h1Text.includes('|')) {
            h1Text = h1Text.split('|')[0].trim();
          }
          
          // Validate it's a reasonable company name (not too short, not a generic term)
          const invalidPatterns = ['home', 'screens', 'tools', 'login', 'screener', 'about'];
          const isInvalid = invalidPatterns.some(pattern => h1Text.toLowerCase() === pattern);
          
          if (h1Text.length > 2 && !isInvalid) {
            console.log(`[SCRAPER] [extractCompanyName] Extracted company name from h1: ${h1Text}`);
            return h1Text;
          }
        }
      }

      // Try other selectors
      const selectors = ['.company-name', '[data-testid="company-name"]'];
      for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          let text = element.text().trim();
          if (text && text.length > 2) {
            console.log(`[SCRAPER] [extractCompanyName] Found text in selector "${selector}": ${text.substring(0, 100)}`);
            return text;
          }
        }
      }

      // Fallback: extract from title tag
      const title = $('title').text().trim();
      if (title) {
        // Title format is usually "Company Name | About Company | ..." or "Company Name share price | ..."
        let extracted = title.split('|')[0].trim();
        if (extracted.toLowerCase().includes('share price')) {
          extracted = extracted.split('share price')[0].trim();
        }
        
        // Validate it's not just "Screener" or other generic terms
        const invalidPatterns = ['screener', 'home', 'screens', 'tools', 'login'];
        const isInvalid = invalidPatterns.some(pattern => extracted.toLowerCase() === pattern);
        
        if (extracted.length > 2 && !isInvalid) {
          console.log(`[SCRAPER] [extractCompanyName] Extracted company name from title: ${extracted}`);
          return extracted;
        }
      }

      console.warn(`[SCRAPER] [extractCompanyName] Could not extract company name, using fallback`);
      return "Unknown Company";
    } catch (error) {
      console.error(`[SCRAPER] [extractCompanyName] Error extracting company name:`, error);
      return "Unknown Company";
    }
  }

  /**
   * Extract sector information
   */
  private extractSector($: ReturnType<typeof load>, ticker: string): string {
    try {
      console.log(`[SCRAPER] [extractSector] Starting sector extraction for ${ticker}...`);
      // Look for sector information in various places
      const sectorSelectors = [
        '.sector',
        '[data-testid="sector"]',
        'a[href*="/sector/"]',
        'a[href*="/industry/"]',
      ];

      for (const selector of sectorSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const text = element.text().trim();
          if (text && text.length > 0 && text.length < 100) {
            console.log(`[SCRAPER] [extractSector] Found sector using selector "${selector}": ${text}`);
            return text;
          }
        }
      }

      // Look for sector in text content
      const bodyText = $('body').text();
      const sectorMatch = bodyText.match(/sector[:\s]+([A-Za-z\s&]+)/i);
      if (sectorMatch && sectorMatch[1]) {
        const extracted = sectorMatch[1].trim();
        console.log(`[SCRAPER] [extractSector] Found sector in body text: ${extracted}`);
        return extracted;
      }

      // Fallback sector mapping based on ticker (common Indian companies)
      const sectorMapping: Record<string, string> = {
        'TCS': 'IT - Services', 'INFY': 'IT - Services', 'WIPRO': 'IT - Services',
        'HCLTECH': 'IT - Services', 'TECHM': 'IT - Services',
        'RELIANCE': 'Refineries', 'ONGC': 'Oil Exploration & Production',
        'HDFCBANK': 'Banks', 'ICICIBANK': 'Banks', 'KOTAKBANK': 'Banks',
        'AXISBANK': 'Banks', 'SBIN': 'Banks',
        'HINDUNILVR': 'Personal Care', 'ITC': 'Tobacco', 'NESTLEIND': 'Food Products',
        'MARUTI': 'Auto', 'TATAMOTORS': 'Auto', 'M&M': 'Auto',
        'SUNPHARMA': 'Pharmaceuticals & Biotechnology', 'DRREDDY': 'Pharmaceuticals & Biotechnology',
        'BHARTIARTL': 'Telecom Services', 'JIO': 'Telecom Services',
      };

      const fallbackSector = sectorMapping[ticker.toUpperCase()] || 'Others';
      console.log(`[SCRAPER] [extractSector] Using fallback sector mapping: ${fallbackSector}`);
      return fallbackSector;
    } catch (error) {
      console.error(`[SCRAPER] [extractSector] Error extracting sector:`, error);
      return 'Others';
    }
  }

  /**
   * Extract quarterly data from HTML
   */
  private extractQuarterlyData(
    $: ReturnType<typeof load>,
    ticker: string,
    companyId?: string
  ): InsertQuarterlyData[] {
    const results: InsertQuarterlyData[] = [];
    const scrapeTimestamp = new Date();

    console.log(`[SCRAPER] [extractQuarterlyData] Starting extraction for ${ticker}`);

    // Find the quarterly results section
    let quarterlySection = $('#quarters').first();
    console.log(`[SCRAPER] [extractQuarterlyData] Found #quarters section: ${quarterlySection.length > 0 ? 'YES' : 'NO'}`);

    let table = quarterlySection.find('table').first();
    console.log(`[SCRAPER] [extractQuarterlyData] Found table in #quarters: ${table.length > 0 ? 'YES' : 'NO'}`);

    if (table.length === 0) {
      console.log(`[SCRAPER] [extractQuarterlyData] Searching all tables for quarterly data...`);
      let tablesChecked = 0;
      // Look for table with quarterly data by checking content
      // Note: Some companies (especially financial/banking) use "Revenue" instead of "Sales"
      $('table').each((_, elem) => {
        tablesChecked++;
        const tableText = $(elem).text();
        const hasSalesOrRevenue = tableText.includes('Sales') || tableText.includes('Revenue');
        const hasNetProfit = tableText.includes('Net Profit');
        const hasQuarterIndicator = tableText.includes('2022') || tableText.includes('2023') || 
          tableText.includes('2024') || tableText.includes('2025') ||
          tableText.includes('Sep') || tableText.includes('Dec') || 
          tableText.includes('Mar') || tableText.includes('Jun');
        
        if (hasSalesOrRevenue && hasNetProfit && hasQuarterIndicator) {
          table = $(elem);
          console.log(`[SCRAPER] [extractQuarterlyData] Found quarterly table at index ${tablesChecked} (hasSales=${tableText.includes('Sales')}, hasRevenue=${tableText.includes('Revenue')})`);
          return false; // Break
        }
      });
      console.log(`[SCRAPER] [extractQuarterlyData] Checked ${tablesChecked} tables`);
    }

    if (table.length === 0) {
      console.warn(`[SCRAPER] [extractQuarterlyData] No quarterly data table found for ${ticker}`);
      return results;
    }

    console.log(`[SCRAPER] [extractQuarterlyData] Found quarterly table with ${table.find('tr').length} rows`);

    // Extract quarter headers - more robust parsing
    // Try thead first, then first row
    let headerRow = table.find('thead tr').first();
    if (headerRow.length === 0) {
      headerRow = table.find('tr').first();
    }
    const quarterHeaders: string[] = [];

    console.log(`[SCRAPER] [extractQuarterlyData] Extracting quarter headers from header row...`);
    console.log(`[SCRAPER] [extractQuarterlyData] Header row has ${headerRow.find('th, td').length} cells`);
    
    headerRow.find('th, td').each((idx, elem) => {
      if (idx === 0) return; // Skip first column (metric names)
      const text = $(elem).text().trim();
      const html = $(elem).html() || '';
      
      // Match quarter formats: "Sep 2023", "Dec 2023", "Mar 2024", "Jun 2024", etc.
      // Also check for dates like "30 Sep 2024" and extract just "Sep 2024"
      if (text && (
        /(Sep|Dec|Mar|Jun)\s+\d{4}/i.test(text) ||
        /(Sep|Dec|Mar|Jun)\s+\d{2}/i.test(text) ||
        /\d+\s+(Sep|Dec|Mar|Jun)\s+\d{4}/i.test(text) || // "30 Sep 2024" format
        (text.includes('Sep') || text.includes('Dec') || text.includes('Mar') || text.includes('Jun'))
      )) {
        // Normalize quarter format to "Sep 2023" style
        const normalized = this.normalizeQuarterFormat(text);
        if (normalized && !quarterHeaders.includes(normalized)) {
          quarterHeaders.push(normalized);
          console.log(`[SCRAPER] [extractQuarterlyData] Found quarter header [${idx}]: "${text}" -> "${normalized}"`);
        } else if (normalized) {
          console.log(`[SCRAPER] [extractQuarterlyData] Skipping duplicate quarter header [${idx}]: "${text}" -> "${normalized}"`);
        } else {
          console.log(`[SCRAPER] [extractQuarterlyData] Could not normalize quarter header [${idx}]: "${text}"`);
        }
      } else if (text) {
        // Log non-matching cells for debugging (only first few to avoid spam)
        if (idx < 10) {
          console.log(`[SCRAPER] [extractQuarterlyData] Non-quarter cell [${idx}]: "${text.substring(0, 50)}"`);
        }
      }
    });

    if (quarterHeaders.length === 0) {
      console.warn(`[SCRAPER] [extractQuarterlyData] No quarter headers found in table`);
      return results;
    }

    console.log(`[SCRAPER] [extractQuarterlyData] Found ${quarterHeaders.length} quarter headers: ${quarterHeaders.join(', ')}`);

    // Extract metric rows
    const rows = table.find('tbody tr, tr').slice(1); // Skip header row
    console.log(`[SCRAPER] [extractQuarterlyData] Found ${rows.length} data rows to process`);

    let metricsProcessed = 0;
    let metricsSkipped = 0;
    rows.each((_, rowElem) => {
      const cells = $(rowElem).find('td, th');
      if (cells.length < 2) {
        metricsSkipped++;
        return;
      }

      const metricName = $(cells[0]).text().trim();
      if (!metricName) {
        metricsSkipped++;
        return;
      }

      // Map metric names to standardized names (matching Python implementation)
      const normalizedMetric = this.normalizeMetricName(metricName);
      if (!normalizedMetric) {
        metricsSkipped++;
        return;
      }

      // Extract values for each quarter
      let valuesExtracted = 0;
      cells.slice(1, quarterHeaders.length + 1).each((idx, cellElem) => {
        if (idx >= quarterHeaders.length) return;

        const valueText = $(cellElem).text().trim();
        const value = this.parseNumericValue(valueText);

        if (value !== null) {
          results.push({
            ticker,
            companyId: companyId || null,
            quarter: quarterHeaders[idx],
            metricName: normalizedMetric,
            metricValue: value.toString(),
            scrapeTimestamp,
          });
          valuesExtracted++;
        }
      });

      if (valuesExtracted > 0) {
        metricsProcessed++;
      } else {
        metricsSkipped++;
      }
    });

    console.log(`[SCRAPER] [extractQuarterlyData] Processed ${metricsProcessed} metrics, skipped ${metricsSkipped} metrics`);
    console.log(`[SCRAPER] [extractQuarterlyData] Extracted ${results.length} total data points before growth metrics`);

    // Calculate and add YoY and QoQ growth metrics if we have Sales and EPS data
    const beforeGrowthMetrics = results.length;
    this.addGrowthMetrics(results, quarterHeaders, ticker, companyId, scrapeTimestamp);
    const growthMetricsAdded = results.length - beforeGrowthMetrics;
    if (growthMetricsAdded > 0) {
      console.log(`[SCRAPER] [extractQuarterlyData] Added ${growthMetricsAdded} growth metrics`);
    }

    console.log(`[SCRAPER] [extractQuarterlyData] Total data points extracted: ${results.length}`);
    return results;
  }

  /**
   * Extract key financial metrics from the company page
   * Returns metrics like P/E, ROCE, ROE, Book Value, Dividend Yield, Current Price, etc.
   */
  private extractKeyMetrics($: ReturnType<typeof load>): Record<string, number | string> {
    const metrics: Record<string, number | string> = {};

    console.log(`[SCRAPER] [extractKeyMetrics] Starting key metrics extraction...`);

    try {
      // Helper function to parse number with commas
      const parseNumber = (str: string): number => {
        return parseFloat(str.replace(/,/g, ''));
      };

      // Helper to extract value from DOM using selectors (more reliable than regex)
      const extractFromDOM = (label: string, selectors: string[]): string | null => {
        for (const selector of selectors) {
          const element = $(selector);
          if (element.length > 0) {
            const text = element.text().trim();
            if (text) return text;
          }
        }
        return null;
      };

      // Method 0: Extract from #top-ratios list (most reliable for Screener.in structure)
      // This is the primary method used by Screener.in for displaying key metrics
      console.log(`[SCRAPER] [extractKeyMetrics] Method 0: Checking for #top-ratios list...`);
      const topRatiosList = $('#top-ratios');
      if (topRatiosList.length > 0) {
        const listItems = topRatiosList.find('li');
        console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found #top-ratios list with ${listItems.length} items, extracting metrics...`);
        
        let metricsFoundInTopRatios = 0;
        topRatiosList.find('li').each((_, li) => {
          const $li = $(li);
          // Try both selectors: span.name and .name
          const nameSpan = $li.find('span.name').length > 0 ? $li.find('span.name') : $li.find('.name');
          // Try both selectors: span.value, .value, and span.nowrap.value
          let valueSpan = $li.find('span.value').length > 0 ? $li.find('span.value') : 
                         $li.find('.value').length > 0 ? $li.find('.value') :
                         $li.find('span.nowrap.value');
          
          if (nameSpan.length > 0 && valueSpan.length > 0) {
            const metricName = nameSpan.text().trim();
            
            // Try to get value from nested <span class="number"> first, then fallback to full text
            const numberSpan = valueSpan.find('span.number');
            let valueText: string;
            let fullValueText: string;
            
            // Get full value text first (includes all text content)
            fullValueText = valueSpan.text().trim();
            
            if (numberSpan.length > 0) {
              // Get text from number span - this is the most reliable
              valueText = numberSpan.text().trim();
              console.log(`[SCRAPER] [extractKeyMetrics] Processing metric from #top-ratios: "${metricName}" = "${valueText}" (from number span), full text: "${fullValueText}"`);
            } else {
              // Fallback: try to extract number from full text
              valueText = fullValueText;
              console.log(`[SCRAPER] [extractKeyMetrics] Processing metric from #top-ratios: "${metricName}" = "${valueText}" (from value span, no number span found)`);
            }
            
            // Debug: log the HTML structure for troubleshooting
            if (valueText === '' || valueText === null || valueText === undefined) {
              console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Empty valueText for "${metricName}", HTML: ${$li.html()?.substring(0, 200)}`);
            }
            
            // Extract numeric value from value text
            let numericValue: number | null = null;
            let metricKey: string | null = null;
            
            // Handle Market Cap (e.g., "976" in number span, with "Cr." in parent)
            if (metricName === 'Market Cap') {
              // Get full value text to check for "Cr."
              const fullValueText = valueSpan.text().trim();
              
              // Strategy 1: Use number span if available and valid
              if (valueText && valueText !== '' && !isNaN(parseNumber(valueText)) && fullValueText.includes('Cr')) {
                numericValue = parseNumber(valueText) * 10000000;
                metrics.marketCap = numericValue;
                metricKey = 'marketCap';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Market Cap from #top-ratios (number span): ${valueText} Cr → ${numericValue}`);
              } else {
                // Strategy 2: Try to match the full text (includes ₹ and Cr.)
                let match = fullValueText.match(/₹\s*([\d,.]+)\s*Cr\.?/i);
                if (!match) {
                  // Strategy 3: Try just the number with "Cr." context
                  match = fullValueText.match(/([\d,.]+)\s*Cr\.?/i);
                }
                if (match) {
                  numericValue = parseNumber(match[1]) * 10000000; // Convert crores to actual value
                  metrics.marketCap = numericValue;
                  metricKey = 'marketCap';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Market Cap from #top-ratios (regex): ${match[1]} Cr → ${numericValue}`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Market Cap value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
                  console.log(`[SCRAPER] [extractKeyMetrics] Debug HTML: ${valueSpan.html()?.substring(0, 150)}`);
                }
              }
            }
            // Handle Current Price (e.g., "24.7" in number span)
            else if (metricName === 'Current Price') {
              const fullValueText = valueSpan.text().trim();
              
              // Strategy 1: Use number span if available and valid
              if (valueText && valueText !== '' && !isNaN(parseNumber(valueText))) {
                numericValue = parseNumber(valueText);
                metrics.currentPrice = numericValue;
                metricKey = 'currentPrice';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Current Price from #top-ratios (number span): ${valueText}`);
              } else {
                // Strategy 2: Try regex on full text
                let match = fullValueText.match(/₹\s*([\d,.]+)/i);
                if (match) {
                  numericValue = parseNumber(match[1]);
                  metrics.currentPrice = numericValue;
                  metricKey = 'currentPrice';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Current Price from #top-ratios (regex): ₹${match[1]}`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Current Price value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
                  console.log(`[SCRAPER] [extractKeyMetrics] Debug HTML: ${valueSpan.html()?.substring(0, 150)}`);
                }
              }
            }
            // Handle High / Low (e.g., "₹ 33.5 / 22.0") - has TWO number spans
            else if (metricName === 'High / Low') {
              const fullValueText = valueSpan.text().trim();
              // Try to get both number spans
              const numberSpans = valueSpan.find('span.number');
              if (numberSpans.length >= 2) {
                const highValue = parseNumber($(numberSpans[0]).text().trim());
                const lowValue = parseNumber($(numberSpans[1]).text().trim());
                if (!isNaN(highValue) && !isNaN(lowValue)) {
                  metrics.highPrice = highValue;
                  metrics.lowPrice = lowValue;
                  metricKey = 'highPrice/lowPrice';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found High/Low from #top-ratios (two number spans): ₹${highValue} / ₹${lowValue}`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  High/Low number spans found but values invalid: "${$(numberSpans[0]).text().trim()}" / "${$(numberSpans[1]).text().trim()}"`);
                }
              } else {
                // Fallback to regex on full text
                const match = fullValueText.match(/₹\s*([\d,.]+)\s*\/\s*₹?\s*([\d,.]+)/i);
                if (match) {
                  metrics.highPrice = parseNumber(match[1]);
                  metrics.lowPrice = parseNumber(match[2]);
                  metricKey = 'highPrice/lowPrice';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found High/Low from #top-ratios (regex fallback): ₹${match[1]} / ₹${match[2]}`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  High/Low value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}", numberSpans.length=${numberSpans.length}`);
                }
              }
            }
            // Handle Stock P/E (e.g., "11.6" in number span)
            else if (metricName === 'Stock P/E') {
              numericValue = parseNumber(valueText);
              if (!isNaN(numericValue)) {
                metrics.pe = numericValue;
                metricKey = 'pe';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Stock P/E from #top-ratios: ${numericValue}`);
              } else {
                console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Stock P/E value is not a valid number: "${valueText}"`);
              }
            }
            // Handle Book Value (e.g., "35.9" in number span)
            else if (metricName === 'Book Value') {
              const fullValueText = valueSpan.text().trim();
              let match = fullValueText.match(/₹\s*([\d,.]+)/i);
              if (!match && !isNaN(parseNumber(valueText))) {
                // If no ₹ symbol but valueText is a valid number, use it directly
                numericValue = parseNumber(valueText);
                metrics.bookValue = numericValue;
                metricKey = 'bookValue';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Book Value from #top-ratios: ${valueText}`);
              } else if (match) {
                numericValue = parseNumber(match[1]);
                metrics.bookValue = numericValue;
                metricKey = 'bookValue';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Book Value from #top-ratios: ₹${match[1]}`);
              } else {
                console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Book Value value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
              }
            }
            // Handle Dividend Yield (e.g., "0.00" in number span, with "%" in parent)
            else if (metricName === 'Dividend Yield') {
              const fullValueText = valueSpan.text().trim();
              let match = fullValueText.match(/([\d,.]+)\s*%/i);
              if (!match && !isNaN(parseNumber(valueText))) {
                // If valueText is a valid number and fullValueText has %, use valueText
                if (fullValueText.includes('%')) {
                  numericValue = parseNumber(valueText);
                  metrics.dividendYield = numericValue;
                  metricKey = 'dividendYield';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Dividend Yield from #top-ratios: ${numericValue}%`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Dividend Yield value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
                }
              } else if (match) {
                numericValue = parseNumber(match[1]);
                metrics.dividendYield = numericValue;
                metricKey = 'dividendYield';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Dividend Yield from #top-ratios: ${numericValue}%`);
              } else {
                console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Dividend Yield value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
              }
            }
            // Handle ROCE (e.g., "5.47" in number span, with "%" in parent)
            else if (metricName === 'ROCE') {
              const fullValueText = valueSpan.text().trim();
              let match = fullValueText.match(/([\d,.]+)\s*%/i);
              if (!match && !isNaN(parseNumber(valueText))) {
                // If valueText is a valid number and fullValueText has %, use valueText
                if (fullValueText.includes('%')) {
                  numericValue = parseNumber(valueText);
                  metrics.roce = numericValue;
                  metricKey = 'roce';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROCE from #top-ratios: ${numericValue}%`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  ROCE value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
                }
              } else if (match) {
                numericValue = parseNumber(match[1]);
                metrics.roce = numericValue;
                metricKey = 'roce';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROCE from #top-ratios: ${numericValue}%`);
              } else {
                console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  ROCE value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
              }
            }
            // Handle ROE (e.g., "5.48" in number span, with "%" in parent)
            else if (metricName === 'ROE') {
              const fullValueText = valueSpan.text().trim();
              let match = fullValueText.match(/([\d,.]+)\s*%/i);
              if (!match && !isNaN(parseNumber(valueText))) {
                // If valueText is a valid number and fullValueText has %, use valueText
                if (fullValueText.includes('%')) {
                  numericValue = parseNumber(valueText);
                  metrics.roe = numericValue;
                  metricKey = 'roe';
                  metricsFoundInTopRatios++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROE from #top-ratios: ${numericValue}%`);
                } else {
                  console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  ROE value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
                }
              } else if (match) {
                numericValue = parseNumber(match[1]);
                metrics.roe = numericValue;
                metricKey = 'roe';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROE from #top-ratios: ${numericValue}%`);
              } else {
                console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  ROE value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
              }
            }
            // Handle Face Value (e.g., "10.0" in number span)
            else if (metricName === 'Face Value') {
              const fullValueText = valueSpan.text().trim();
              let match = fullValueText.match(/₹\s*([\d,.]+)/i);
              if (!match && !isNaN(parseNumber(valueText))) {
                // If no ₹ symbol but valueText is a valid number, use it directly
                numericValue = parseNumber(valueText);
                metrics.faceValue = numericValue;
                metricKey = 'faceValue';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Face Value from #top-ratios: ${valueText}`);
              } else if (match) {
                numericValue = parseNumber(match[1]);
                metrics.faceValue = numericValue;
                metricKey = 'faceValue';
                metricsFoundInTopRatios++;
                console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Face Value from #top-ratios: ₹${match[1]}`);
              } else {
                console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  Face Value value text didn't match pattern: valueText="${valueText}", fullValueText="${fullValueText}"`);
              }
            } else {
              console.log(`[SCRAPER] [extractKeyMetrics] ℹ️  Unknown metric name in #top-ratios: "${metricName}" (value: "${valueText}")`);
            }
          } else {
            console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  List item missing name or value span: nameSpan.length=${nameSpan.length}, valueSpan.length=${valueSpan.length}`);
          }
        });
        
        console.log(`[SCRAPER] [extractKeyMetrics] Method 0 (#top-ratios) summary: Found ${metricsFoundInTopRatios} metrics, Total metrics so far: ${Object.keys(metrics).length}`);
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ✗ #top-ratios list not found, will try fallback methods`);
      }

      // Method 1: DOM-based extraction (fallback for pages without #top-ratios or missing metrics)
      // Screener.in often structures data in tables or specific divs
      // Look for elements containing the label text followed by the value
      console.log(`[SCRAPER] [extractKeyMetrics] Method 1: DOM-based extraction (fallback for missing metrics)...`);
      const metricsBeforeMethod1 = Object.keys(metrics).length;
      let metricsFoundInMethod1 = 0;
      
      $('*').each((_, el) => {
        const text = $(el).text().trim();
        
        // Market Cap - handle "Market Cap ₹ 1,14,718 Cr." or "Market Cap ₹5,715 Cr"
        if (text.includes('Market Cap') && !metrics.marketCap) {
          const match = text.match(/Market Cap\s+₹\s*([\d,.]+)\s*Cr\.?/i);
          if (match) {
            metrics.marketCap = parseNumber(match[1]) * 10000000;
            metricsFoundInMethod1++;
            console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Market Cap (Method 1 - DOM): ₹${match[1]} Cr`);
          }
        }
        
        // Current Price
        if (text.includes('Current Price') && !metrics.currentPrice) {
          const match = text.match(/Current Price\s+₹\s*([\d,.]+)/i);
          if (match) {
            metrics.currentPrice = parseNumber(match[1]);
            metricsFoundInMethod1++;
            console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Current Price (Method 1 - DOM): ₹${match[1]}`);
          }
        }
        
        // High/Low - handle "High / Low ₹ 2,012 / 1,303" (second number may not have ₹)
        if (!metrics.highPrice && /High\s*\/\s*Low/i.test(text)) {
          const match = text.match(/High\s*\/\s*Low\s+₹\s*([\d,.]+)\s*\/\s*₹?\s*([\d,.]+)/i);
          if (match) {
            metrics.highPrice = parseNumber(match[1]);
            metrics.lowPrice = parseNumber(match[2]);
            metricsFoundInMethod1++;
            console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found High/Low (Method 1 - DOM): ₹${match[1]} / ₹${match[2]}`);
          }
        }
        
        // ROCE - find element containing ROCE, then look in parent for number
        if (!metrics.roce && /^ROCE$/i.test(text.trim())) {
          const parent = $(el).parent();
          const parentText = parent.text();
          // Look for number pattern in parent element
          const match = parentText.match(/ROCE[\s\S]{0,200}?([\d,.]+)\s*%/i);
          if (match) {
            metrics.roce = parseNumber(match[1]);
            metricsFoundInMethod1++;
            console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROCE (Method 1 - DOM parent): ${match[1]}%`);
          }
        }
        
        // ROE - find element containing ROE, then look in parent for number
        if (!metrics.roe && /^ROE$/i.test(text.trim())) {
          const parent = $(el).parent();
          const parentText = parent.text();
          // Look for number pattern in parent element
          const match = parentText.match(/ROE[\s\S]{0,200}?([\d,.]+)\s*%/i);
          if (match) {
            metrics.roe = parseNumber(match[1]);
            metricsFoundInMethod1++;
            console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROE (Method 1 - DOM parent): ${match[1]}%`);
          }
        }
      });
      
      console.log(`[SCRAPER] [extractKeyMetrics] Method 1 (DOM) summary: Found ${metricsFoundInMethod1} new metrics, Total metrics so far: ${Object.keys(metrics).length}`);

      // Method 2: Regex on full page text (fallback and for metrics not found via DOM)
      console.log(`[SCRAPER] [extractKeyMetrics] Method 2: Regex extraction from full page text (fallback for missing metrics)...`);
      const pageText = $.text();
      console.log(`[SCRAPER] [extractKeyMetrics] Page text length: ${pageText.length} characters`);
      const metricsBeforeMethod2 = Object.keys(metrics).length;
      let metricsFoundInMethod2 = 0;

      // Extract Market Cap - handle comma-separated numbers like "5,715" or "1,14,718" (Indian numbering)
      // Also handle "Cr." with period
      if (!metrics.marketCap) {
        const marketCapMatch = pageText.match(/Market Cap\s+₹\s*([\d,.]+)\s*Cr\.?/i);
        if (marketCapMatch) {
          const value = parseNumber(marketCapMatch[1]) * 10000000; // Convert crores to actual value
          metrics.marketCap = value;
          metricsFoundInMethod2++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Market Cap (Method 2 - Regex): ₹${marketCapMatch[1]} Cr → ${value}`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ Market Cap not found in page text (Method 2)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ Market Cap already found, skipping Method 2`);
      }

      // Extract Current Price - handle comma-separated numbers
      if (!metrics.currentPrice) {
        const currentPriceMatch = pageText.match(/Current Price\s+₹\s*([\d,.]+)/i);
        if (currentPriceMatch) {
          metrics.currentPrice = parseNumber(currentPriceMatch[1]);
          metricsFoundInMethod2++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Current Price (Method 2 - Regex): ₹${currentPriceMatch[1]}`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ Current Price not found in page text (Method 2)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ Current Price already found, skipping Method 2`);
      }

      // Extract High/Low - handle "High / Low ₹ 2,012 / 1,303" format
      // Second number may or may not have ₹ symbol
      if (!metrics.highPrice) {
        const highLowMatch = pageText.match(/High\s*\/\s*Low\s+₹\s*([\d,.]+)\s*\/\s*₹?\s*([\d,.]+)/i);
        if (highLowMatch) {
          metrics.highPrice = parseNumber(highLowMatch[1]);
          metrics.lowPrice = parseNumber(highLowMatch[2]);
          metricsFoundInMethod2++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found High/Low (Method 2 - Regex): ₹${highLowMatch[1]} / ₹${highLowMatch[2]}`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ High/Low not found in page text (Method 2)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ High/Low already found, skipping Method 2`);
      }

      // Extract Stock P/E
      if (!metrics.pe) {
        const peMatch = pageText.match(/Stock P\/E\s+([\d,.]+)/i) || pageText.match(/P\/E\s+([\d,.]+)/i);
        if (peMatch) {
          metrics.pe = parseNumber(peMatch[1]);
          metricsFoundInMethod2++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Stock P/E (Method 2 - Regex): ${peMatch[1]}`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ Stock P/E not found in page text (Method 2)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ Stock P/E already found, skipping Method 2`);
      }

      // Extract Book Value - handle comma-separated numbers
      if (!metrics.bookValue) {
        const bookValueMatch = pageText.match(/Book Value\s+₹\s*([\d,.]+)/i);
        if (bookValueMatch) {
          metrics.bookValue = parseNumber(bookValueMatch[1]);
          metricsFoundInMethod2++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Book Value (Method 2 - Regex): ₹${bookValueMatch[1]}`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ Book Value not found in page text (Method 2)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ Book Value already found, skipping Method 2`);
      }

      // Extract Dividend Yield
      if (!metrics.dividendYield) {
        const dividendYieldMatch = pageText.match(/Dividend Yield\s+([\d,.]+)\s*%/i);
        if (dividendYieldMatch) {
          metrics.dividendYield = parseNumber(dividendYieldMatch[1]);
          metricsFoundInMethod2++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Dividend Yield (Method 2 - Regex): ${dividendYieldMatch[1]}%`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ Dividend Yield not found in page text (Method 2)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ Dividend Yield already found, skipping Method 2`);
      }
      
      console.log(`[SCRAPER] [extractKeyMetrics] Method 2 (Regex) summary: Found ${metricsFoundInMethod2} new metrics, Total metrics so far: ${Object.keys(metrics).length}`);

      // Method 3: Targeted DOM traversal for ROCE and ROE (fallback for missing metrics)
      console.log(`[SCRAPER] [extractKeyMetrics] Method 3: Targeted DOM traversal for ROCE/ROE (fallback for missing metrics)...`);
      const metricsBeforeMethod3 = Object.keys(metrics).length;
      let metricsFoundInMethod3 = 0;
      
      // Extract ROCE - use targeted DOM traversal after main loop
      if (!metrics.roce) {
        console.log(`[SCRAPER] [extractKeyMetrics] Searching for ROCE using Method 3...`);
        // Find elements containing exactly "ROCE" text (case-insensitive)
        $('*').each((_, el) => {
          if (metrics.roce) return false; // Stop if already found
          
          const text = $(el).text().trim();
          if (text === 'ROCE' || text === 'Roce' || text === 'roce') {
            // Get parent container
            const parent = $(el).parent();
            if (parent.length > 0) {
              // Get all children of parent to find the value
              parent.children().each((_, child) => {
                if (metrics.roce) return false;
                const childText = $(child).text().trim();
                // Look for a number followed by %
                const numMatch = childText.match(/^([\d,.]+)\s*%$/);
                if (numMatch) {
                  metrics.roce = parseNumber(numMatch[1]);
                  metricsFoundInMethod3++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROCE (Method 3 - sibling element): ${numMatch[1]}%`);
                  return false;
                }
              });
              
              // If not found in direct children, check parent's text for pattern
              if (!metrics.roce) {
                const parentText = parent.text();
                const match = parentText.match(/ROCE[\s\S]{0,200}?([\d,.]+)\s*%/i);
                if (match) {
                  metrics.roce = parseNumber(match[1]);
                  metricsFoundInMethod3++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROCE (Method 3 - parent text): ${match[1]}%`);
                  return false;
                }
              }
              
              // Also check next sibling of parent (sometimes value is in next element)
              if (!metrics.roce) {
                const nextSibling = parent.next();
                if (nextSibling.length > 0) {
                  const nextText = nextSibling.text().trim();
                  const numMatch = nextText.match(/^([\d,.]+)\s*%$/);
                  if (numMatch) {
                    metrics.roce = parseNumber(numMatch[1]);
                    metricsFoundInMethod3++;
                    console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROCE (Method 3 - next sibling): ${numMatch[1]}%`);
                    return false;
                  }
                }
              }
            }
          }
        });
        if (!metrics.roce) {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ ROCE not found using Method 3`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ ROCE already found, skipping Method 3`);
      }

      // Extract ROE - use targeted DOM traversal after main loop
      if (!metrics.roe) {
        console.log(`[SCRAPER] [extractKeyMetrics] Searching for ROE using Method 3...`);
        // Find elements containing exactly "ROE" text (case-insensitive)
        $('*').each((_, el) => {
          if (metrics.roe) return false; // Stop if already found
          
          const text = $(el).text().trim();
          if (text === 'ROE' || text === 'Roe' || text === 'roe') {
            // Get parent container
            const parent = $(el).parent();
            if (parent.length > 0) {
              // Get all children of parent to find the value
              parent.children().each((_, child) => {
                if (metrics.roe) return false;
                const childText = $(child).text().trim();
                // Look for a number followed by %
                const numMatch = childText.match(/^([\d,.]+)\s*%$/);
                if (numMatch) {
                  metrics.roe = parseNumber(numMatch[1]);
                  metricsFoundInMethod3++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROE (Method 3 - sibling element): ${numMatch[1]}%`);
                  return false;
                }
              });
              
              // If not found in direct children, check parent's text for pattern
              if (!metrics.roe) {
                const parentText = parent.text();
                const match = parentText.match(/ROE[\s\S]{0,200}?([\d,.]+)\s*%/i);
                if (match) {
                  metrics.roe = parseNumber(match[1]);
                  metricsFoundInMethod3++;
                  console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROE (Method 3 - parent text): ${match[1]}%`);
                  return false;
                }
              }
              
              // Also check next sibling of parent (sometimes value is in next element)
              if (!metrics.roe) {
                const nextSibling = parent.next();
                if (nextSibling.length > 0) {
                  const nextText = nextSibling.text().trim();
                  const numMatch = nextText.match(/^([\d,.]+)\s*%$/);
                  if (numMatch) {
                    metrics.roe = parseNumber(numMatch[1]);
                    metricsFoundInMethod3++;
                    console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found ROE (Method 3 - next sibling): ${numMatch[1]}%`);
                    return false;
                  }
                }
              }
            }
          }
        });
        if (!metrics.roe) {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ ROE not found using Method 3`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ ROE already found, skipping Method 3`);
      }

      // Extract Face Value - handle comma-separated numbers
      if (!metrics.faceValue) {
        const faceValueMatch = pageText.match(/Face Value\s+₹\s*([\d,.]+)/i);
        if (faceValueMatch) {
          metrics.faceValue = parseNumber(faceValueMatch[1]);
          metricsFoundInMethod3++;
          console.log(`[SCRAPER] [extractKeyMetrics] ✓ Found Face Value (Method 3 - Regex): ₹${faceValueMatch[1]}`);
        } else {
          console.log(`[SCRAPER] [extractKeyMetrics] ✗ Face Value not found in page text (Method 3)`);
        }
      } else {
        console.log(`[SCRAPER] [extractKeyMetrics] ⊘ Face Value already found, skipping Method 3`);
      }
      
      console.log(`[SCRAPER] [extractKeyMetrics] Method 3 (Targeted DOM) summary: Found ${metricsFoundInMethod3} new metrics, Total metrics so far: ${Object.keys(metrics).length}`);

    } catch (error) {
      console.error(`[SCRAPER] [extractKeyMetrics] ✗ Error extracting key metrics:`, error);
      if (error instanceof Error) {
        console.error(`[SCRAPER] [extractKeyMetrics] Error stack:`, error.stack);
      }
    }

    // Final summary
    const finalMetrics = Object.keys(metrics);
    console.log(`[SCRAPER] [extractKeyMetrics] ========================================`);
    console.log(`[SCRAPER] [extractKeyMetrics] FINAL SUMMARY: Extracted ${finalMetrics.length} key metrics`);
    if (finalMetrics.length > 0) {
      console.log(`[SCRAPER] [extractKeyMetrics] Metrics found: ${finalMetrics.join(', ')}`);
      // Log each metric value for debugging
      finalMetrics.forEach(key => {
        console.log(`[SCRAPER] [extractKeyMetrics]   - ${key}: ${metrics[key]}`);
      });
    } else {
      console.log(`[SCRAPER] [extractKeyMetrics] ⚠️  WARNING: No key metrics extracted!`);
      console.log(`[SCRAPER] [extractKeyMetrics] This may indicate the page structure has changed or the company page is missing key metrics.`);
    }
    console.log(`[SCRAPER] [extractKeyMetrics] ========================================`);
    
    return metrics;
  }

  /**
   * Normalize quarter format to standard "Sep 2023" style
   */
  private normalizeQuarterFormat(text: string): string {
    // Remove extra whitespace and common suffixes like "(TTM)"
    text = text.trim().replace(/\s*\(.*?\)\s*$/, '').trim();

    // Match patterns like:
    // - "Sep 2023", "Sep'23", "Sep23"
    // - "30 Sep 2024" -> extract "Sep 2024"
    // Pattern: optional day number, then month, then year
    const match = text.match(/(\d+\s+)?(Sep|Dec|Mar|Jun)[\s']*(\d{2,4})/i);
    
    if (match) {
      // match[1] = optional day number (e.g., "30 ")
      // match[2] = month (e.g., "Sep")
      // match[3] = year (e.g., "2024" or "24")
      const month = match[2];
      const year = match[3];
      
      if (month && year) {
        const monthStr = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
        let yearStr = year.toString();

        // Convert 2-digit year to 4-digit
        if (yearStr.length === 2) {
          const yearNum = parseInt(yearStr);
          yearStr = yearNum > 50 ? `19${yearStr}` : `20${yearStr}`;
        }

        return `${monthStr} ${yearStr}`;
      }
    }

    // Fallback: return text if we can't parse it
    return text;
  }

  /**
   * Add YoY and QoQ growth metrics based on existing data
   */
  private addGrowthMetrics(
    results: InsertQuarterlyData[],
    quarters: string[],
    ticker: string,
    companyId: string | null | undefined,
    scrapeTimestamp: Date
  ): void {
    // Group data by metric
    const metricData: Record<string, Record<string, number>> = {};

    results.forEach(item => {
      if (!metricData[item.metricName]) {
        metricData[item.metricName] = {};
      }
      metricData[item.metricName][item.quarter] = parseFloat(item.metricValue || '0');
    });

    // Calculate growth for Sales
    if (metricData['Sales']) {
      const salesYoY = this.calculateYoYGrowth(metricData['Sales'], quarters);
      const salesQoQ = this.calculateQoQGrowth(metricData['Sales'], quarters);

      salesYoY.forEach((value, idx) => {
        if (value !== null && quarters[idx]) {
          results.push({
            ticker,
            companyId: companyId || null,
            quarter: quarters[idx],
            metricName: 'Sales Growth(YoY) %',
            metricValue: value.toString(),
            scrapeTimestamp,
          });
        }
      });

      salesQoQ.forEach((value, idx) => {
        if (value !== null && quarters[idx]) {
          results.push({
            ticker,
            companyId: companyId || null,
            quarter: quarters[idx],
            metricName: 'Sales Growth(QoQ) %',
            metricValue: value.toString(),
            scrapeTimestamp,
          });
        }
      });
    }

    // Calculate growth for EPS
    if (metricData['EPS in Rs']) {
      const epsYoY = this.calculateYoYGrowth(metricData['EPS in Rs'], quarters);
      const epsQoQ = this.calculateQoQGrowth(metricData['EPS in Rs'], quarters);

      epsYoY.forEach((value, idx) => {
        if (value !== null && quarters[idx]) {
          results.push({
            ticker,
            companyId: companyId || null,
            quarter: quarters[idx],
            metricName: 'EPS Growth(YoY) %',
            metricValue: value.toString(),
            scrapeTimestamp,
          });
        }
      });

      epsQoQ.forEach((value, idx) => {
        if (value !== null && quarters[idx]) {
          results.push({
            ticker,
            companyId: companyId || null,
            quarter: quarters[idx],
            metricName: 'EPS Growth(QoQ) %',
            metricValue: value.toString(),
            scrapeTimestamp,
          });
        }
      });
    }
  }

  /**
   * Calculate Year-over-Year growth
   */
  private calculateYoYGrowth(values: Record<string, number>, quarters: string[]): (number | null)[] {
    const growth: (number | null)[] = [];

    for (let i = 0; i < quarters.length; i++) {
      const currentQuarter = quarters[i];
      const currentValue = values[currentQuarter];

      if (i >= 4 && currentValue !== undefined && currentValue !== null) {
        // Compare with same quarter previous year (4 quarters ago)
        const previousYearQuarter = quarters[i - 4];
        const previousYearValue = values[previousYearQuarter];

        if (previousYearValue !== undefined && previousYearValue !== null && previousYearValue !== 0) {
          const growthPercent = ((currentValue - previousYearValue) / previousYearValue) * 100;
          growth.push(parseFloat(growthPercent.toFixed(2)));
        } else {
          growth.push(null);
        }
      } else {
        growth.push(null);
      }
    }

    return growth;
  }

  /**
   * Calculate Quarter-over-Quarter growth
   */
  private calculateQoQGrowth(values: Record<string, number>, quarters: string[]): (number | null)[] {
    const growth: (number | null)[] = [];

    for (let i = 0; i < quarters.length; i++) {
      const currentQuarter = quarters[i];
      const currentValue = values[currentQuarter];

      if (i >= 1 && currentValue !== undefined && currentValue !== null) {
        // Compare with previous quarter
        const previousQuarter = quarters[i - 1];
        const previousValue = values[previousQuarter];

        if (previousValue !== undefined && previousValue !== null && previousValue !== 0) {
          const growthPercent = ((currentValue - previousValue) / previousValue) * 100;
          growth.push(parseFloat(growthPercent.toFixed(2)));
        } else {
          growth.push(null);
        }
      } else {
        growth.push(null);
      }
    }

    return growth;
  }

  /**
   * Normalize metric names to standard format (matching Python implementation)
   * Note: Financial companies on screener.in use "Revenue" instead of "Sales"
   * We normalize both to "Sales" for consistency
   */
  private normalizeMetricName(metricName: string): string | null {
    const name = metricName.toLowerCase().trim();

    // Comprehensive metric mapping matching Python enhanced_scraper
    // Handle both "Sales" and "Revenue" - financial companies often use "Revenue"
    // Check for "Revenue" first (more specific), then "Sales"
    if ((name.includes('revenue') && (name.includes('+') || name === 'revenue' || name === 'revenue +')) ||
        (name.includes('sales') && (name.includes('+') || name === 'sales' || name === 'sales +'))) {
      return 'Sales';  // Normalize "Revenue" to "Sales" for consistency
    } else if ((name.includes('sales yoy') || name.includes('sales growth yoy') || 
                name.includes('revenue yoy') || name.includes('revenue growth yoy')) && name.includes('%')) {
      return 'Sales Growth(YoY) %';
    } else if ((name.includes('sales qoq') || name.includes('sales growth qoq') ||
                name.includes('revenue qoq') || name.includes('revenue growth qoq')) && name.includes('%')) {
      return 'Sales Growth(QoQ) %';
    } else if (name.includes('expenses') && (name.includes('+') || name === 'expenses' || name === 'expenses +')) {
      return 'Expenses';
    } else if (name.includes('operating profit') && !name.includes('opm') && !name.includes('%')) {
      return 'Operating Profit';
    } else if (name.includes('opm %') || name.includes('opm%') || (name.includes('operating profit margin') && name.includes('%'))) {
      return 'OPM %';
    } else if (name.includes('financing profit')) {
      return 'Financing Profit';
    } else if (name.includes('financing margin %') || name.includes('financing margin%')) {
      return 'Financing Margin %';
    } else if (name.includes('other income') && (name.includes('+') || name === 'other income' || name === 'other income +')) {
      return 'Other Income';
    } else if (name.includes('interest') && !name.includes('other') && !name.includes('income')) {
      return 'Interest';
    } else if (name.includes('depreciation')) {
      return 'Depreciation';
    } else if (name.includes('profit before tax') || name.includes('pbt')) {
      return 'Profit before tax';
    } else if (name.includes('tax %') || name.includes('tax%') || (name.includes('tax') && name.includes('%'))) {
      return 'Tax %';
    } else if (name.includes('net profit') && (name.includes('+') || name === 'net profit' || name === 'net profit +')) {
      return 'Net Profit';
    } else if (name.includes('eps in rs') || (name.includes('eps') && !name.includes('growth') && !name.includes('%'))) {
      return 'EPS in Rs';
    } else if ((name.includes('eps yoy') || name.includes('eps growth yoy')) && name.includes('%')) {
      return 'EPS Growth(YoY) %';
    } else if ((name.includes('eps qoq') || name.includes('eps growth qoq')) && name.includes('%')) {
      return 'EPS Growth(QoQ) %';
    } else if (name.includes('gross npa %') || name.includes('gross npa%')) {
      return 'Gross NPA %';
    }

    return null; // Skip unknown metrics
  }

  /**
   * Parse numeric value from text (handling Indian formats)
   */
  private parseNumericValue(text: string): number | null {
    if (!text || text.trim() === '' || text.trim() === '-') {
      return null;
    }

    // Remove commas and other formatting
    let cleaned = text.replace(/,/g, '').trim();

    // Handle negative values in parentheses
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = '-' + cleaned.slice(1, -1);
    }

    // Handle percentage values
    if (cleaned.includes('%')) {
      cleaned = cleaned.replace('%', '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }

    // Handle crore notation (common in Indian financial data)
    if (cleaned.toLowerCase().includes('cr')) {
      cleaned = cleaned.toLowerCase().replace('cr', '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num * 10000000; // Convert to actual number
    }

    // Handle lakh notation
    if (cleaned.toLowerCase().includes('l') || cleaned.toLowerCase().includes('lakh')) {
      cleaned = cleaned.toLowerCase().replace(/l(akh)?/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num * 100000; // Convert to actual number
    }

    // Handle thousand notation
    if (cleaned.toLowerCase().includes('k') || cleaned.toLowerCase().includes('thousand')) {
      cleaned = cleaned.toLowerCase().replace(/k|thousand/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num * 1000;
    }

    // Handle standard numeric values
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Scrape multiple companies
   * @param tickers Array of ticker symbols to scrape
   * @param sectorId Optional sector ID - if provided, all companies will use this sector
   */
  async scrapeCompanies(tickers: string[], sectorId?: string): Promise<ScrapeResult[]> {
    this.status = {
      isRunning: true,
      totalTickers: tickers.length,
      completedTickers: 0,
      startTime: new Date(),
      lastUpdate: new Date(),
    };

    const results: ScrapeResult[] = [];

    for (const ticker of tickers) {
      this.status.currentTicker = ticker;
      this.status.lastUpdate = new Date();

      // Get company ID if available
      const company = await storage.getCompanyByTicker(ticker);
      const companyId = company?.id;

      // Determine sector override priority:
      // 1. If sectorId parameter provided, use that sector for all companies
      // 2. If company exists and has a sector, use it to preserve user-provided sector
      // 3. Otherwise, let scrapeCompany extract from scraped data
      let sectorOverride: string | undefined;
      if (sectorId) {
        const sector = await storage.getSector(sectorId);
        if (sector) {
          sectorOverride = sector.name;
        }
      } else if (company?.sectorId) {
        const sector = await storage.getSector(company.sectorId);
        if (sector) {
          sectorOverride = sector.name;
        }
      }

      const result = await this.scrapeCompany(ticker, companyId, sectorOverride, undefined);
      results.push(result);

      this.status.completedTickers = (this.status.completedTickers || 0) + 1;
    }

    this.status.isRunning = false;
    this.status.currentTicker = undefined;

    return results;
  }

  /**
   * Get current scrape status
   */
  getStatus(): ScrapeStatus {
    return { ...this.status };
  }

  /**
   * Reset scrape status
   */
  resetStatus(): void {
    this.status = {
      isRunning: false,
    };
  }

}

export const scraper = new ScreenerScraper();
