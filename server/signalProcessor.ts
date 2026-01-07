/**
 * Background Signal Processor
 * Handles async signal calculation with queue system and batch processing
 */

import { FormulaEvaluator } from "./formulaEvaluator";
import { storage } from "./storage";

export interface SignalJob {
  id: string;
  type: "incremental" | "full" | "company";
  companyIds?: string[];
  batchSize?: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  processed: number;
  total: number;
  signalsGenerated: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

class SignalProcessor {
  private queue: SignalJob[] = [];
  private activeJob: SignalJob | null = null;
  private isProcessing = false;
  private readonly defaultBatchSize = 50;

  /**
   * Add a job to the queue
   */
  async enqueueJob(
    type: "incremental" | "full" | "company",
    companyIds?: string[],
    batchSize?: number
  ): Promise<string> {
    const job: SignalJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      companyIds,
      batchSize: batchSize || this.defaultBatchSize,
      status: "pending",
      progress: 0,
      processed: 0,
      total: 0,
      signalsGenerated: 0,
      createdAt: new Date(),
    };

    this.queue.push(job);
    console.log(`[SignalProcessor] Enqueued job ${job.id} (type: ${type})`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue().catch((error) => {
        console.error("[SignalProcessor] Error processing queue:", error);
      });
    }

    return job.id;
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      this.activeJob = job;
      job.status = "processing";
      job.startedAt = new Date();

      try {
        await this.processJob(job);
        job.status = "completed";
        job.completedAt = new Date();
        job.progress = 100;
        console.log(
          `[SignalProcessor] Job ${job.id} completed: ${job.signalsGenerated} signals generated`
        );
      } catch (error: any) {
        job.status = "failed";
        job.error = error.message;
        job.completedAt = new Date();
        console.error(`[SignalProcessor] Job ${job.id} failed:`, error);
      } finally {
        this.activeJob = null;
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process a single job
   */
  private async processJob(job: SignalJob): Promise<void> {
    console.log(`[SignalProcessor] Processing job ${job.id} (type: ${job.type})`);

    if (job.type === "incremental") {
      // Process stale signals in batches
      const { FormulaEvaluator } = await import("./formulaEvaluator");
      const staleCompanies = await FormulaEvaluator.findStaleSignalCompanies();
      job.total = staleCompanies.length;

      if (staleCompanies.length === 0) {
        job.signalsGenerated = 0;
        job.processed = 0;
        return;
      }

      // Process in batches
      const batchSize = job.batchSize || this.defaultBatchSize;
      let processed = 0;
      let signalsGenerated = 0;

      for (let i = 0; i < staleCompanies.length; i += batchSize) {
        const batch = staleCompanies.slice(i, i + batchSize);
        const companyIds = batch.map((c) => c.id);

        const count = await FormulaEvaluator.calculateAndStoreSignals(companyIds);
        signalsGenerated += count;
        processed += batch.length;

        job.processed = processed;
        job.signalsGenerated = signalsGenerated;
        job.progress = Math.round((processed / staleCompanies.length) * 100);

        console.log(
          `[SignalProcessor] Job ${job.id}: Processed ${processed}/${staleCompanies.length} companies (${signalsGenerated} signals)`
        );

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < staleCompanies.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } else if (job.type === "full") {
      // Process all companies
      const { FormulaEvaluator } = await import("./formulaEvaluator");
      const allCompanies = await storage.getAllCompanies();
      job.total = allCompanies.length;

      if (job.batchSize && job.batchSize < allCompanies.length) {
        // Process in batches
        let processed = 0;
        let signalsGenerated = 0;

        for (let i = 0; i < allCompanies.length; i += job.batchSize) {
          const batch = allCompanies.slice(i, i + job.batchSize);
          const companyIds = batch.map((c) => c.id);

          const count = await FormulaEvaluator.calculateAndStoreSignals(companyIds);
          signalsGenerated += count;
          processed += batch.length;

          job.processed = processed;
          job.signalsGenerated = signalsGenerated;
          job.progress = Math.round((processed / allCompanies.length) * 100);

          if (i + job.batchSize < allCompanies.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      } else {
        // Process all at once
        const count = await FormulaEvaluator.calculateAndStoreSignals();
        job.signalsGenerated = count;
        job.processed = allCompanies.length;
        job.progress = 100;
      }
    } else if (job.type === "company" && job.companyIds) {
      // Process specific companies
      const { FormulaEvaluator } = await import("./formulaEvaluator");
      job.total = job.companyIds.length;

      const count = await FormulaEvaluator.calculateAndStoreSignals(job.companyIds);
      job.signalsGenerated = count;
      job.processed = job.companyIds.length;
      job.progress = 100;
    }
  }

  /**
   * Get current job status
   */
  getJobStatus(jobId: string): SignalJob | undefined {
    if (this.activeJob?.id === jobId) {
      return this.activeJob;
    }
    // Note: In a production system, you'd want to persist jobs to a database
    // For now, we only track the active job
    return undefined;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeJob: SignalJob | null;
    isProcessing: boolean;
  } {
    return {
      queueLength: this.queue.length,
      activeJob: this.activeJob,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Cancel a pending job (only works if it hasn't started processing)
   */
  cancelJob(jobId: string): boolean {
    const index = this.queue.findIndex((j) => j.id === jobId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.log(`[SignalProcessor] Cancelled job ${jobId}`);
      return true;
    }
    return false;
  }
}

export const signalProcessor = new SignalProcessor();














