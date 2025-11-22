/**
 * Screener.in Web Scraper for Indian Companies
 * Enhanced scraper matching Python implementation
 * Scrapes quarterly financial data from Screener.in
 */

import { load } from "cheerio";
import { storage } from "./storage";
import type { InsertQuarterlyData } from "@shared/schema";

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

  /**
   * Search for ticker by company name using Screener.in API
   */
  async searchTickerByCompanyName(companyName: string): Promise<{ ticker: string; companyName: string; detectedSector: string; exists: boolean } | null> {
    // Screener.in search API - using the internal API endpoint
    const searchUrl = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(companyName)}&v=3&fts=1`;
    
    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.screener.in/explore/',
          'X-Requested-With': 'XMLHttpRequest',
          'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
        },
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
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

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
   * Fetch company metadata (name and sector) without full scraping
   */
  async fetchCompanyMetadata(ticker: string): Promise<{ ticker: string; companyName: string; detectedSector: string; exists: boolean }> {
    const url = `https://www.screener.in/company/${ticker}/consolidated/#quarters`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

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
   */
  async scrapeCompany(ticker: string, companyId?: string, sectorOverride?: string, userId?: string): Promise<ScrapeResult> {
    const url = `https://www.screener.in/company/${ticker}/consolidated/#quarters`;
    const startedAt = new Date();
    let logId: string | null = null;
    
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
      
      // Add delay to avoid rate limiting (2-5 seconds, matching Python)
      await this.delay(Math.random() * 3000 + 2000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = load(html);
      
      // Extract company name and sector
      const companyName = this.extractCompanyName($);
      
      // Check if company already exists
      let existingCompany = companyId ? await storage.getCompany(companyId) : null;
      if (!existingCompany) {
        // Try to find by ticker (but we need sectorId to get the right one if multiple exist)
        // For now, just get first match - caller should provide companyId if there are multiple
        existingCompany = await storage.getCompanyByTicker(ticker);
      }
      
      // Priority: Use sectorOverride (user-provided) if available
      // If company exists with a sector, NEVER update it from scraped data
      let sectorName: string;
      
      if (sectorOverride) {
        // User provided sector - use it
        sectorName = sectorOverride;
      } else if (existingCompany?.sectorId) {
        // Company exists with a sector - use it, NEVER update from scraped data
        const sector = await storage.getSector(existingCompany.sectorId);
        sectorName = sector?.name || "Unknown";
      } else {
        // No existing company or no sector - extract from scraped data (only for NEW companies)
        sectorName = this.extractSector($, ticker);
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
      const keyMetrics = this.extractKeyMetrics($);
      
      // Find quarterly data table
      const quarterlyData = this.extractQuarterlyData($, ticker, finalCompanyId || undefined);
      
      if (quarterlyData.length === 0) {
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
      
      // Store in database
      await storage.bulkCreateQuarterlyData(quarterlyData);
      
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
        }
      }

      // Count unique quarters and metrics
      const uniqueQuarters = new Set(quarterlyData.map(d => d.quarter));
      const uniqueMetrics = new Set(quarterlyData.map(d => d.metricName));

      // Get sector ID for logging
      let sectorIdForLog = null;
      if (finalCompanyId) {
        const company = await storage.getCompanyByTicker(ticker);
        sectorIdForLog = company?.sectorId || null;
      }

      // Update scraping log with success
      if (logId) {
        try {
          await storage.updateScrapingLog(logId, {
            companyId: finalCompanyId || null,
            sectorId: sectorIdForLog,
            status: 'success',
            quartersScraped: uniqueQuarters.size,
            metricsScraped: uniqueMetrics.size,
            completedAt: new Date(),
          });
        } catch (e) {
          // If update fails, log error but continue
          console.error("Error updating scraping log:", e);
        }
      }

      return {
        success: true,
        ticker,
        companyName,
        sector: sectorName,
        quartersScraped: uniqueQuarters.size,
        metricsScraped: uniqueMetrics.size,
      };
    } catch (error: any) {
      console.error(`Error scraping ${ticker}:`, error);
      
      // Update scraping log with failure
      if (logId) {
        try {
          await storage.updateScrapingLog(logId, {
            status: 'failed',
            quartersScraped: 0,
            metricsScraped: 0,
            error: error.message || "Unknown error",
            completedAt: new Date(),
          });
        } catch (logError) {
          console.error("Error updating scraping log:", logError);
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
      // Try multiple selectors for company name
      const selectors = ['h1', '.company-name', '[data-testid="company-name"]', 'title'];
      
      for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          let text = element.text().trim();
          if (text) {
            // Clean up the name
            if (text.toLowerCase().includes('share price')) {
              text = text.split('share price')[0].trim();
            }
            if (text.toLowerCase().includes('ltd') || text.toLowerCase().includes('limited')) {
              return text;
            }
          }
        }
      }
      
      // Fallback: extract from title tag
      const title = $('title').text().trim();
      if (title && title.toLowerCase().includes('ltd')) {
        return title.split(' - ')[0].trim();
      }
      
      return "Unknown Company";
    } catch (error) {
      console.error("Error extracting company name:", error);
      return "Unknown Company";
    }
  }

  /**
   * Extract sector information
   */
  private extractSector($: ReturnType<typeof load>, ticker: string): string {
    try {
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
            return text;
          }
        }
      }
      
      // Look for sector in text content
      const bodyText = $('body').text();
      const sectorMatch = bodyText.match(/sector[:\s]+([A-Za-z\s&]+)/i);
      if (sectorMatch && sectorMatch[1]) {
        return sectorMatch[1].trim();
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
      
      return sectorMapping[ticker.toUpperCase()] || 'Others';
    } catch (error) {
      console.error("Error extracting sector:", error);
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

    // Find the quarterly results section
    let quarterlySection = $('#quarters').first();
    let table = quarterlySection.find('table').first();
    
    if (table.length === 0) {
      // Look for table with quarterly data by checking content
      $('table').each((_, elem) => {
        const tableText = $(elem).text();
        if (tableText.includes('Sales') && tableText.includes('Net Profit') && 
            (tableText.includes('2022') || tableText.includes('2023') || tableText.includes('2024') || 
             tableText.includes('Sep') || tableText.includes('Dec') || tableText.includes('Mar') || tableText.includes('Jun'))) {
          table = $(elem);
          return false; // Break
        }
      });
    }

    if (table.length === 0) {
      return results;
    }

    // Extract quarter headers - more robust parsing
    const headerRow = table.find('thead tr, tr').first();
    const quarterHeaders: string[] = [];
    
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
        }
      }
    });

    if (quarterHeaders.length === 0) {
      return results;
    }

    // Extract metric rows
    const rows = table.find('tbody tr, tr').slice(1); // Skip header row
    
    rows.each((_, rowElem) => {
      const cells = $(rowElem).find('td, th');
      if (cells.length < 2) return;

      const metricName = $(cells[0]).text().trim();
      if (!metricName) return;

      // Map metric names to standardized names (matching Python implementation)
      const normalizedMetric = this.normalizeMetricName(metricName);
      if (!normalizedMetric) return;

      // Extract values for each quarter
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
        }
      });
    });

    // Calculate and add YoY and QoQ growth metrics if we have Sales and EPS data
    this.addGrowthMetrics(results, quarterHeaders, ticker, companyId, scrapeTimestamp);

    return results;
  }

  /**
   * Extract key financial metrics from the company page
   * Returns metrics like P/E, ROCE, ROE, Book Value, Dividend Yield, Current Price, etc.
   */
  private extractKeyMetrics($: ReturnType<typeof load>): Record<string, number | string> {
    const metrics: Record<string, number | string> = {};
    
    try {
      // Find the key metrics section - typically in a table or div with class containing "ratios" or similar
      // Screener.in displays these in a structured format
      
      // Method 1: Look for specific text patterns
      const pageText = $.text();
      
      // Extract Market Cap
      const marketCapMatch = pageText.match(/Market Cap\s+₹\s*([\d.]+)\s*Cr/i);
      if (marketCapMatch) {
        const value = parseFloat(marketCapMatch[1]) * 10000000; // Convert crores to actual value
        metrics.marketCap = value;
      }
      
      // Extract Current Price
      const currentPriceMatch = pageText.match(/Current Price\s+₹\s*([\d.]+)/i);
      if (currentPriceMatch) {
        metrics.currentPrice = parseFloat(currentPriceMatch[1]);
      }
      
      // Extract High/Low
      const highLowMatch = pageText.match(/High\s*\/\s*Low\s+₹\s*([\d.]+)\s*\/\s*([\d.]+)/i);
      if (highLowMatch) {
        metrics.highPrice = parseFloat(highLowMatch[1]);
        metrics.lowPrice = parseFloat(highLowMatch[2]);
      }
      
      // Extract Stock P/E
      const peMatch = pageText.match(/Stock P\/E\s+([\d.]+)/i) || pageText.match(/P\/E\s+([\d.]+)/i);
      if (peMatch) {
        metrics.pe = parseFloat(peMatch[1]);
      }
      
      // Extract Book Value
      const bookValueMatch = pageText.match(/Book Value\s+₹\s*([\d.]+)/i);
      if (bookValueMatch) {
        metrics.bookValue = parseFloat(bookValueMatch[1]);
      }
      
      // Extract Dividend Yield
      const dividendYieldMatch = pageText.match(/Dividend Yield\s+([\d.]+)\s*%/i);
      if (dividendYieldMatch) {
        metrics.dividendYield = parseFloat(dividendYieldMatch[1]);
      }
      
      // Extract ROCE
      const roceMatch = pageText.match(/ROCE\s+([\d.]+)\s*%/i);
      if (roceMatch) {
        metrics.roce = parseFloat(roceMatch[1]);
      }
      
      // Extract ROE
      const roeMatch = pageText.match(/ROE\s+([\d.]+)\s*%/i);
      if (roeMatch) {
        metrics.roe = parseFloat(roeMatch[1]);
      }
      
      // Extract Face Value
      const faceValueMatch = pageText.match(/Face Value\s+₹\s*([\d.]+)/i);
      if (faceValueMatch) {
        metrics.faceValue = parseFloat(faceValueMatch[1]);
      }
      
    } catch (error) {
      console.error('Error extracting key metrics:', error);
    }
    
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

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const scraper = new ScreenerScraper();
