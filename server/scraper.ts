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
      $('table').each((_, elem) => {
        tablesChecked++;
        const tableText = $(elem).text();
        if (tableText.includes('Sales') && tableText.includes('Net Profit') &&
          (tableText.includes('2022') || tableText.includes('2023') || tableText.includes('2024') ||
            tableText.includes('Sep') || tableText.includes('Dec') || tableText.includes('Mar') || tableText.includes('Jun'))) {
          table = $(elem);
          console.log(`[SCRAPER] [extractQuarterlyData] Found quarterly table at index ${tablesChecked}`);
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
    const headerRow = table.find('thead tr, tr').first();
    const quarterHeaders: string[] = [];

    console.log(`[SCRAPER] [extractQuarterlyData] Extracting quarter headers from header row...`);
    headerRow.find('th, td').each((idx, elem) => {
      if (idx === 0) return; // Skip first column (metric names)
      const text = $(elem).text().trim();
      // Match quarter formats: "Sep 2023", "Dec 2023", "Mar 2024", "Jun 2024", etc.
      if (text && (
        /(Sep|Dec|Mar|Jun)\s+\d{4}/i.test(text) ||
        /(Sep|Dec|Mar|Jun)\s+\d{2}/i.test(text) ||
        (text.includes('Sep') || text.includes('Dec') || text.includes('Mar') || text.includes('Jun'))
      )) {
        // Normalize quarter format to "Sep 2023" style
        const normalized = this.normalizeQuarterFormat(text);
        if (normalized && !quarterHeaders.includes(normalized)) {
          quarterHeaders.push(normalized);
          console.log(`[SCRAPER] [extractQuarterlyData] Found quarter header: ${text} -> ${normalized}`);
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

      // Try DOM-based extraction first (more reliable)
      // Screener.in often structures data in tables or specific divs
      // Look for elements containing the label text followed by the value
      
      // Method 1: DOM-based extraction (try this first for better reliability)
      $('*').each((_, el) => {
        const text = $(el).text().trim();
        
        // Market Cap - handle "Market Cap ₹ 1,14,718 Cr." or "Market Cap ₹5,715 Cr"
        if (text.includes('Market Cap') && !metrics.marketCap) {
          const match = text.match(/Market Cap\s+₹\s*([\d,.]+)\s*Cr\.?/i);
          if (match) {
            metrics.marketCap = parseNumber(match[1]) * 10000000;
            console.log(`[SCRAPER] [extractKeyMetrics] Found Market Cap (DOM): ₹${match[1]} Cr`);
          }
        }
        
        // Current Price
        if (text.includes('Current Price') && !metrics.currentPrice) {
          const match = text.match(/Current Price\s+₹\s*([\d,.]+)/i);
          if (match) {
            metrics.currentPrice = parseNumber(match[1]);
            console.log(`[SCRAPER] [extractKeyMetrics] Found Current Price (DOM): ₹${match[1]}`);
          }
        }
      });

      // Method 2: Regex on full page text (fallback and for metrics not found via DOM)
      const pageText = $.text();
      console.log(`[SCRAPER] [extractKeyMetrics] Page text length: ${pageText.length} characters`);

      // Extract Market Cap - handle comma-separated numbers like "5,715" or "1,14,718" (Indian numbering)
      // Also handle "Cr." with period
      const marketCapMatch = pageText.match(/Market Cap\s+₹\s*([\d,.]+)\s*Cr\.?/i);
      if (marketCapMatch) {
        const value = parseNumber(marketCapMatch[1]) * 10000000; // Convert crores to actual value
        metrics.marketCap = value;
        console.log(`[SCRAPER] [extractKeyMetrics] Found Market Cap: ₹${marketCapMatch[1]} Cr`);
      }

      // Extract Current Price - handle comma-separated numbers
      const currentPriceMatch = pageText.match(/Current Price\s+₹\s*([\d,.]+)/i);
      if (currentPriceMatch) {
        metrics.currentPrice = parseNumber(currentPriceMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found Current Price: ₹${currentPriceMatch[1]}`);
      }

      // Extract High/Low - handle comma-separated numbers
      const highLowMatch = pageText.match(/High\s*\/\s*Low\s+₹\s*([\d,.]+)\s*\/\s*₹\s*([\d,.]+)/i);
      if (highLowMatch) {
        metrics.highPrice = parseNumber(highLowMatch[1]);
        metrics.lowPrice = parseNumber(highLowMatch[2]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found High/Low: ₹${highLowMatch[1]} / ₹${highLowMatch[2]}`);
      }

      // Extract Stock P/E
      const peMatch = pageText.match(/Stock P\/E\s+([\d,.]+)/i) || pageText.match(/P\/E\s+([\d,.]+)/i);
      if (peMatch) {
        metrics.pe = parseNumber(peMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found Stock P/E: ${peMatch[1]}`);
      }

      // Extract Book Value - handle comma-separated numbers
      const bookValueMatch = pageText.match(/Book Value\s+₹\s*([\d,.]+)/i);
      if (bookValueMatch) {
        metrics.bookValue = parseNumber(bookValueMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found Book Value: ₹${bookValueMatch[1]}`);
      }

      // Extract Dividend Yield
      const dividendYieldMatch = pageText.match(/Dividend Yield\s+([\d,.]+)\s*%/i);
      if (dividendYieldMatch) {
        metrics.dividendYield = parseNumber(dividendYieldMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found Dividend Yield: ${dividendYieldMatch[1]}%`);
      }

      // Extract ROCE
      const roceMatch = pageText.match(/ROCE\s+([\d,.]+)\s*%/i);
      if (roceMatch) {
        metrics.roce = parseNumber(roceMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found ROCE: ${roceMatch[1]}%`);
      }

      // Extract ROE
      const roeMatch = pageText.match(/ROE\s+([\d,.]+)\s*%/i);
      if (roeMatch) {
        metrics.roe = parseNumber(roeMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found ROE: ${roeMatch[1]}%`);
      }

      // Extract Face Value - handle comma-separated numbers
      const faceValueMatch = pageText.match(/Face Value\s+₹\s*([\d,.]+)/i);
      if (faceValueMatch) {
        metrics.faceValue = parseNumber(faceValueMatch[1]);
        console.log(`[SCRAPER] [extractKeyMetrics] Found Face Value: ₹${faceValueMatch[1]}`);
      }

    } catch (error) {
      console.error(`[SCRAPER] [extractKeyMetrics] Error extracting key metrics:`, error);
    }

    console.log(`[SCRAPER] [extractKeyMetrics] Extracted ${Object.keys(metrics).length} key metrics: ${Object.keys(metrics).join(', ')}`);
    return metrics;
  }

  /**
   * Normalize quarter format to standard "Sep 2023" style
   */
  private normalizeQuarterFormat(text: string): string {
    // Remove extra whitespace
    text = text.trim();

    // Match patterns like "Sep 2023", "Sep'23", "Sep23", etc.
    const match = text.match(/(Sep|Dec|Mar|Jun)[\s']*(\d{2,4})/i);
    if (match) {
      const month = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      let year = match[2];

      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        const yearNum = parseInt(year);
        year = yearNum > 50 ? `19${year}` : `20${year}`;
      }

      return `${month} ${year}`;
    }

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
   */
  private normalizeMetricName(metricName: string): string | null {
    const name = metricName.toLowerCase().trim();

    // Comprehensive metric mapping matching Python enhanced_scraper
    if (name.includes('sales') && (name.includes('+') || name.includes('total'))) {
      return 'Sales';
    } else if ((name.includes('sales yoy') || name.includes('sales growth yoy')) && name.includes('%')) {
      return 'Sales Growth(YoY) %';
    } else if ((name.includes('sales qoq') || name.includes('sales growth qoq')) && name.includes('%')) {
      return 'Sales Growth(QoQ) %';
    } else if (name.includes('expenses') && (name.includes('+') || name.includes('total'))) {
      return 'Expenses';
    } else if (name.includes('operating profit') && !name.includes('opm') && !name.includes('%')) {
      return 'Operating Profit';
    } else if (name.includes('opm %') || name.includes('opm%') || (name.includes('operating profit margin') && name.includes('%'))) {
      return 'OPM %';
    } else if (name.includes('financing profit')) {
      return 'Financing Profit';
    } else if (name.includes('financing margin %') || name.includes('financing margin%')) {
      return 'Financing Margin %';
    } else if (name.includes('other income') && (name.includes('+') || name.includes('total'))) {
      return 'Other Income';
    } else if (name.includes('interest') && !name.includes('other') && !name.includes('income')) {
      return 'Interest';
    } else if (name.includes('depreciation')) {
      return 'Depreciation';
    } else if (name.includes('profit before tax') || name.includes('pbt')) {
      return 'Profit before tax';
    } else if (name.includes('tax %') || name.includes('tax%') || (name.includes('tax') && name.includes('%'))) {
      return 'Tax %';
    } else if (name.includes('net profit') && (name.includes('+') || name.includes('total'))) {
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
