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
    console.log("[Scheduler] Loading schedule settings from database...");
    
    // Get or create default settings
    const dailyScrapingSetting = await storage.getSchedulerSetting("daily-scraping") || 
      await storage.upsertSchedulerSetting({
        jobType: "daily-scraping",
        schedule: "0 6 * * *",
        enabled: true,
        description: "Daily scraping for all sectors"
      });

    console.log(`[Scheduler] Daily scraping setting: enabled=${dailyScrapingSetting.enabled}, schedule=${dailyScrapingSetting.schedule}`);

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
    } else {
      console.log("[Scheduler] Daily scraping is disabled, skipping scheduling");
    }

    if (signalFullSetting.enabled) {
      this.scheduleSignalRefreshFull(signalFullSetting.schedule);
    }

    // Load and schedule sector-specific schedules
    const sectorSchedules = await storage.getAllSectorSchedules();
    console.log(`[Scheduler] Found ${sectorSchedules.length} sector-specific schedules`);
    for (const sectorSchedule of sectorSchedules) {
      if (sectorSchedule.enabled) {
        this.scheduleSectorScraping(sectorSchedule.sectorId, sectorSchedule.schedule);
      }
    }
    
    console.log(`[Scheduler] Total scheduled jobs: ${this.jobs.size}`);
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
    // Stop existing job if it exists
    const existingJob = this.jobs.get("daily-all-sectors");
    if (existingJob) {
      console.log("[Scheduler] Stopping existing daily-all-sectors job before rescheduling");
      existingJob.stop();
      this.jobs.delete("daily-all-sectors");
    }

    console.log(`[Scheduler] Scheduling daily scraping with cron: ${schedule} (timezone: Asia/Kolkata)`);
    
    const task = cronSchedule(schedule, async () => {
      console.log(`[Scheduler] ✓ Triggered: Starting daily scraping at ${new Date().toISOString()}`);
      
      try {
        // Get all sectors
        const sectors = await storage.getAllSectors();
        console.log(`[Scheduler] Found ${sectors.length} sectors to scrape`);
        
        if (sectors.length === 0) {
          console.log(`[Scheduler] No sectors found, skipping scraping`);
          return;
        }

        // Get system user ID for history tracking
        let systemUserId: string;
        try {
          systemUserId = await this.getSystemUserId();
        } catch (error: any) {
          console.error(`[Scheduler] Failed to get system user ID: ${error.message}`);
          return;
        }

        // Create history record
        const history = await storage.createSectorUpdateHistory({
          userId: systemUserId,
          status: 'pending',
          progress: 0,
          totalSectors: sectors.length,
          completedSectors: 0,
          successfulSectors: 0,
          failedSectors: 0,
          sectorResults: [],
        });

        console.log(`[Scheduler] Created history record: ${history.id}`);

        try {
          // Update status to running
          await storage.updateSectorUpdateHistory(history.id, { status: 'running' });
        
        for (const sector of sectors) {
          try {
            // Get companies in this sector
            const companies = await storage.getCompaniesBySector(sector.id);
            
            if (companies.length === 0) {
              console.log(`[Scheduler] No companies in sector ${sector.name}, skipping`);
                
                // Update history for empty sector
                const currentHistory = await storage.getSectorUpdateHistory(history.id);
                if (currentHistory) {
                  await storage.updateSectorUpdateHistory(history.id, {
                    completedSectors: (currentHistory.completedSectors || 0) + 1,
                    successfulSectors: (currentHistory.successfulSectors || 0) + 1,
                    progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                    sectorResults: [...(currentHistory.sectorResults || []), {
                      sectorId: sector.id,
                      sectorName: sector.name,
                      status: 'success' as const,
                      companiesUpdated: 0,
                    }],
                  });
                }
              continue;
            }
            
            const tickers = companies.map(c => c.ticker);
            console.log(`[Scheduler] Scraping ${tickers.length} companies in sector ${sector.name}`);
            
              // Scrape companies (await to track results)
              const results = await scraper.scrapeCompanies(tickers);
              const successCount = results.filter(r => r.success).length;
              
              console.log(`[Scheduler] Sector ${sector.name}: ${successCount}/${tickers.length} companies scraped successfully`);

              // Update history with sector result
              const currentHistory = await storage.getSectorUpdateHistory(history.id);
              if (currentHistory) {
                await storage.updateSectorUpdateHistory(history.id, {
                  completedSectors: (currentHistory.completedSectors || 0) + 1,
                  successfulSectors: (currentHistory.successfulSectors || 0) + 1,
                  progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                  sectorResults: [...(currentHistory.sectorResults || []), {
                    sectorId: sector.id,
                    sectorName: sector.name,
                    status: 'success' as const,
                    companiesUpdated: successCount,
                  }],
                });
              }
            
            // Add delay between sectors to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 5000));
          } catch (error: any) {
            console.error(`[Scheduler] Error processing sector ${sector.id}:`, error);
              
              // Update history with error
              const currentHistory = await storage.getSectorUpdateHistory(history.id);
              if (currentHistory) {
                await storage.updateSectorUpdateHistory(history.id, {
                  completedSectors: (currentHistory.completedSectors || 0) + 1,
                  failedSectors: (currentHistory.failedSectors || 0) + 1,
                  progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                  sectorResults: [...(currentHistory.sectorResults || []), {
                    sectorId: sector.id,
                    sectorName: sector.name,
                    status: 'error' as const,
                    error: error.message,
                  }],
                });
              }
            }
          }

          // Mark as completed
          const finalHistory = await storage.getSectorUpdateHistory(history.id);
          if (finalHistory) {
            await storage.updateSectorUpdateHistory(history.id, {
              status: 'completed',
              progress: 100,
              completedAt: new Date(),
            });
          }
          
          console.log(`[Scheduler] ✓ Daily scraping completed at ${new Date().toISOString()}`);
        } catch (error: any) {
          console.error("[Scheduler] ✗ Error in daily scraping:", error);
          
          // Mark history as failed
          await storage.updateSectorUpdateHistory(history.id, {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          });
        }
      } catch (error: any) {
        console.error("[Scheduler] ✗ Error in daily scraping job:", error);
      }
    }, {
      timezone: "Asia/Kolkata", // Indian timezone
    });
    
    this.jobs.set("daily-all-sectors", task);
    console.log(`[Scheduler] ✓ Daily scraping job scheduled successfully with schedule: ${schedule}`);
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
   * Schedule full signal refresh
   */
  private scheduleSignalRefreshFull(schedule: string = "0 3 * * 0") {
    // Stop existing job if it exists
    const existingJob = this.jobs.get("signal-refresh-full");
    if (existingJob) {
      existingJob.stop();
      this.jobs.delete("signal-refresh-full");
    }

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

  /**
   * Get a system user ID for scheduler operations (uses first admin user)
   */
  private async getSystemUserId(): Promise<string> {
    const adminUsers = await storage.getAdminUsers();
    if (adminUsers.length > 0) {
      return adminUsers[0].id;
    }
    // Fallback: get any user
    const allUsers = await storage.getAllUsers();
    if (allUsers.length > 0) {
      return allUsers[0].id;
    }
    throw new Error("No users found in database. Cannot create scheduler history record.");
  }

  /**
   * Manually trigger daily scraping job (for testing)
   */
  async triggerDailyScraping(): Promise<void> {
    console.log(`[Scheduler] Manual trigger: Starting daily scraping at ${new Date().toISOString()}`);
    
    try {
      // Get all sectors
      const sectors = await storage.getAllSectors();
      console.log(`[Scheduler] Found ${sectors.length} sectors to scrape`);
      
      if (sectors.length === 0) {
        console.log(`[Scheduler] No sectors found, skipping scraping`);
        return;
      }

      // Get system user ID for history tracking
      const systemUserId = await this.getSystemUserId();

      // Create history record
      const history = await storage.createSectorUpdateHistory({
        userId: systemUserId,
        status: 'pending',
        progress: 0,
        totalSectors: sectors.length,
        completedSectors: 0,
        successfulSectors: 0,
        failedSectors: 0,
        sectorResults: [],
      });

      console.log(`[Scheduler] Created history record: ${history.id}`);

      try {
        // Update status to running
        await storage.updateSectorUpdateHistory(history.id, { status: 'running' });

        for (const sector of sectors) {
          try {
            // Get companies in this sector
            const companies = await storage.getCompaniesBySector(sector.id);
            
            if (companies.length === 0) {
              console.log(`[Scheduler] No companies in sector ${sector.name}, skipping`);
              
              // Update history for empty sector
              const currentHistory = await storage.getSectorUpdateHistory(history.id);
              if (currentHistory) {
                await storage.updateSectorUpdateHistory(history.id, {
                  completedSectors: (currentHistory.completedSectors || 0) + 1,
                  successfulSectors: (currentHistory.successfulSectors || 0) + 1,
                  progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                  sectorResults: [...(currentHistory.sectorResults || []), {
                    sectorId: sector.id,
                    sectorName: sector.name,
                    status: 'success' as const,
                    companiesUpdated: 0,
                  }],
                });
              }
              continue;
            }
            
            const tickers = companies.map(c => c.ticker);
            console.log(`[Scheduler] Scraping ${tickers.length} companies in sector ${sector.name}`);
            
            // Scrape companies (await to track results)
            const results = await scraper.scrapeCompanies(tickers);
            const successCount = results.filter(r => r.success).length;
            
            console.log(`[Scheduler] Sector ${sector.name}: ${successCount}/${tickers.length} companies scraped successfully`);

            // Update history with sector result
            const currentHistory = await storage.getSectorUpdateHistory(history.id);
            if (currentHistory) {
              await storage.updateSectorUpdateHistory(history.id, {
                completedSectors: (currentHistory.completedSectors || 0) + 1,
                successfulSectors: (currentHistory.successfulSectors || 0) + 1,
                progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                sectorResults: [...(currentHistory.sectorResults || []), {
                  sectorId: sector.id,
                  sectorName: sector.name,
                  status: 'success' as const,
                  companiesUpdated: successCount,
                }],
              });
            }
            
            // Add delay between sectors to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 5000));
          } catch (error: any) {
            console.error(`[Scheduler] Error processing sector ${sector.id}:`, error);
            
            // Update history with error
            const currentHistory = await storage.getSectorUpdateHistory(history.id);
            if (currentHistory) {
              await storage.updateSectorUpdateHistory(history.id, {
                completedSectors: (currentHistory.completedSectors || 0) + 1,
                failedSectors: (currentHistory.failedSectors || 0) + 1,
                progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                sectorResults: [...(currentHistory.sectorResults || []), {
                  sectorId: sector.id,
                  sectorName: sector.name,
                  status: 'error' as const,
                  error: error.message,
                }],
              });
            }
          }
        }

        // Mark as completed
        const finalHistory = await storage.getSectorUpdateHistory(history.id);
        if (finalHistory) {
          await storage.updateSectorUpdateHistory(history.id, {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
          });
        }
        
        console.log(`[Scheduler] ✓ Daily scraping completed at ${new Date().toISOString()}`);
      } catch (error: any) {
        console.error("[Scheduler] ✗ Error in daily scraping:", error);
        
        // Mark history as failed
        await storage.updateSectorUpdateHistory(history.id, {
          status: 'failed',
          error: error.message,
          completedAt: new Date(),
        });
        
        throw error;
      }
    } catch (error: any) {
      console.error("[Scheduler] ✗ Error in manual daily scraping:", error);
      throw error;
    }
  }
}

export const scrapingScheduler = new ScrapingScheduler();

