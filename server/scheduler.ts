/**
 * Scheduled Scraping Service
 * Handles automatic daily scraping of sectors
 */

import { schedule as cronSchedule, type ScheduledTask } from "node-cron";
import { storage } from "./storage";
import { scraper } from "./scraper";

interface ScheduledJob {
  id: string;
  sectorId: string;
  schedule: string; // Cron expression
  enabled: boolean;
  conditions?: {
    marketCapMin?: number;
    marketCapMax?: number;
    otherConditions?: string;
  };
}

class ScrapingScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private defaultSchedule = "0 6 * * *"; // 6 AM daily

  /**
   * Initialize scheduler with default daily job
   */
  async initialize() {
    console.log("Initializing scraping scheduler...");
    
    // Load schedule settings from database or use defaults
    await this.loadAndScheduleJobs();
    
    console.log("Scraping scheduler initialized.");
  }

  /**
   * Load schedule settings from database and schedule jobs
   */
  private async loadAndScheduleJobs() {
    // Get or create default settings
    const dailyScrapingSetting = await storage.getSchedulerSetting("daily-scraping") || 
      await storage.upsertSchedulerSetting({
        jobType: "daily-scraping",
        schedule: "0 6 * * *",
        enabled: true,
        description: "Daily scraping for all sectors"
      });

    const signalIncrementalSetting = await storage.getSchedulerSetting("signal-incremental") ||
      await storage.upsertSchedulerSetting({
        jobType: "signal-incremental",
        schedule: "0 2 * * *",
        enabled: true,
        description: "Daily incremental signal refresh"
      });

    const signalFullSetting = await storage.getSchedulerSetting("signal-full") ||
      await storage.upsertSchedulerSetting({
        jobType: "signal-full",
        schedule: "0 3 * * 0",
        enabled: true,
        description: "Weekly full signal refresh (Sundays)"
      });

    // Schedule jobs based on settings
    if (dailyScrapingSetting.enabled) {
      this.scheduleDailyScraping(dailyScrapingSetting.schedule);
    }

    if (signalIncrementalSetting.enabled) {
      this.scheduleSignalRefreshIncremental(signalIncrementalSetting.schedule);
    }

    if (signalFullSetting.enabled) {
      this.scheduleSignalRefreshFull(signalFullSetting.schedule);
    }

    // Load and schedule sector-specific schedules
    const sectorSchedules = await storage.getAllSectorSchedules();
    for (const sectorSchedule of sectorSchedules) {
      if (sectorSchedule.enabled) {
        this.scheduleSectorScraping(sectorSchedule.sectorId, sectorSchedule.schedule);
      }
    }
  }

  /**
   * Reload schedule settings and reschedule jobs
   */
  async reloadSchedules() {
    // Stop all existing jobs
    this.stopAll();
    // Reload and reschedule
    await this.loadAndScheduleJobs();
  }

  /**
   * Schedule daily scraping for all sectors
   */
  private scheduleDailyScraping(schedule: string = this.defaultSchedule) {
    const task = cronSchedule(schedule, async () => {
      console.log(`[Scheduler] Starting daily scraping at ${new Date().toISOString()}`);
      
      try {
        // Get all sectors
        const sectors = await storage.getAllSectors();
        
        for (const sector of sectors) {
          try {
            // Get companies in this sector
            const companies = await storage.getCompaniesBySector(sector.id);
            
            if (companies.length === 0) {
              console.log(`[Scheduler] No companies in sector ${sector.name}, skipping`);
              continue;
            }
            
            const tickers = companies.map(c => c.ticker);
            console.log(`[Scheduler] Scraping ${tickers.length} companies in sector ${sector.name}`);
            
            // Scrape companies (non-blocking)
            scraper.scrapeCompanies(tickers).catch((error) => {
              console.error(`[Scheduler] Error scraping sector ${sector.name}:`, error);
            });
            
            // Add delay between sectors to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 5000));
          } catch (error: any) {
            console.error(`[Scheduler] Error processing sector ${sector.id}:`, error);
          }
        }
        
        console.log(`[Scheduler] Daily scraping completed at ${new Date().toISOString()}`);
      } catch (error: any) {
        console.error("[Scheduler] Error in daily scraping job:", error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata", // Indian timezone
    });
    
    this.jobs.set("daily-all-sectors", task);
  }

  /**
   * Schedule scraping for a specific sector
   */
  scheduleSectorScraping(sectorId: string, schedule: string = this.defaultSchedule, conditions?: ScheduledJob["conditions"]) {
    const jobId = `sector-${sectorId}`;
    
    // Stop existing job if any
    this.stopSectorScraping(sectorId);
    
    const task = cronSchedule(schedule, async () => {
      console.log(`[Scheduler] Starting scheduled scraping for sector ${sectorId} at ${new Date().toISOString()}`);
      
      try {
        // Get companies in this sector
        const companies = await storage.getCompaniesBySector(sectorId);
        
        // Apply conditions if provided
        let companiesToScrape = companies;
        if (conditions?.marketCapMin || conditions?.marketCapMax) {
          companiesToScrape = companies.filter(company => {
            if (!company.marketCap) return false;
            const marketCap = parseFloat(company.marketCap);
            if (isNaN(marketCap)) return false;
            
            if (conditions.marketCapMin && marketCap < conditions.marketCapMin * 10000000) return false;
            if (conditions.marketCapMax && marketCap > conditions.marketCapMax * 10000000) return false;
            return true;
          });
        }
        
        const tickers = companiesToScrape.map(c => c.ticker);
        
        if (tickers.length === 0) {
          console.log(`[Scheduler] No companies found matching conditions for sector ${sectorId}`);
          return;
        }
        
        console.log(`[Scheduler] Scraping ${tickers.length} companies in sector ${sectorId}`);
        scraper.scrapeCompanies(tickers).catch((error) => {
          console.error(`[Scheduler] Error scraping sector ${sectorId}:`, error);
        });
      } catch (error: any) {
        console.error(`[Scheduler] Error in scheduled scraping for sector ${sectorId}:`, error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata",
    });
    
    this.jobs.set(jobId, task);
    console.log(`[Scheduler] Scheduled scraping for sector ${sectorId} with schedule: ${schedule}`);
  }

  /**
   * Stop scheduled scraping for a specific sector
   */
  stopSectorScraping(sectorId: string) {
    const jobId = `sector-${sectorId}`;
    const task = this.jobs.get(jobId);
    if (task) {
      task.stop();
      this.jobs.delete(jobId);
      console.log(`[Scheduler] Stopped scheduled scraping for sector ${sectorId}`);
    }
  }

  /**
   * Get all scheduled jobs
   */
  getScheduledJobs(): Array<{ id: string; sectorId?: string; schedule: string }> {
    const jobs: Array<{ id: string; sectorId?: string; schedule: string }> = [];
    
    this.jobs.forEach((task, id) => {
      if (id === "daily-all-sectors") {
        jobs.push({ id, schedule: this.defaultSchedule });
      } else if (id.startsWith("sector-")) {
        const sectorId = id.replace("sector-", "");
        jobs.push({ id, sectorId, schedule: this.defaultSchedule }); // TODO: Store actual schedule
      }
    });
    
    return jobs;
  }

  /**
   * Schedule incremental signal refresh
   */
  private scheduleSignalRefreshIncremental(schedule: string = "0 2 * * *") {
    const incrementalTask = cronSchedule(schedule, async () => {
      console.log(`[Scheduler] Starting incremental signal refresh at ${new Date().toISOString()}`);
      
      try {
        const { signalProcessor } = await import("./signalProcessor");
        const jobId = await signalProcessor.enqueueJob("incremental", undefined, 50);
        console.log(`[Scheduler] Enqueued incremental signal refresh job: ${jobId}`);
      } catch (error: any) {
        console.error("[Scheduler] Error scheduling incremental signal refresh:", error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata",
    });
    
    this.jobs.set("signal-refresh-incremental", incrementalTask);
    console.log(`[Scheduler] Scheduled incremental signal refresh: ${schedule}`);
  }

  /**
   * Schedule full signal refresh
   */
  private scheduleSignalRefreshFull(schedule: string = "0 3 * * 0") {
    const fullRefreshTask = cronSchedule(schedule, async () => {
      console.log(`[Scheduler] Starting weekly full signal refresh at ${new Date().toISOString()}`);
      
      try {
        const { signalProcessor } = await import("./signalProcessor");
        const jobId = await signalProcessor.enqueueJob("full", undefined, 100);
        console.log(`[Scheduler] Enqueued full signal refresh job: ${jobId}`);
      } catch (error: any) {
        console.error("[Scheduler] Error scheduling full signal refresh:", error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata",
    });
    
    this.jobs.set("signal-refresh-full", fullRefreshTask);
    console.log(`[Scheduler] Scheduled full signal refresh: ${schedule}`);
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    this.jobs.forEach((task, id) => {
      task.stop();
      console.log(`[Scheduler] Stopped job: ${id}`);
    });
    this.jobs.clear();
  }
}

export const scrapingScheduler = new ScrapingScheduler();

