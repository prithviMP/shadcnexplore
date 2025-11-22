/**
 * Background Task Manager
 * Tracks progress of long-running tasks like updating all sectors
 */

interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  totalSectors: number;
  completedSectors: number;
  successfulSectors: number;
  failedSectors: number;
  sectorResults: Array<{
    sectorId: string;
    sectorName: string;
    status: 'success' | 'error';
    error?: string;
    companiesUpdated?: number;
  }>;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

class TaskManager {
  private tasks: Map<string, TaskStatus> = new Map();

  /**
   * Create a new task
   */
  createTask(taskId: string, totalSectors: number): TaskStatus {
    const task: TaskStatus = {
      taskId,
      status: 'pending',
      progress: 0,
      totalSectors,
      completedSectors: 0,
      successfulSectors: 0,
      failedSectors: 0,
      sectorResults: [],
      startTime: new Date(),
    };
    
    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Get task status
   */
  getTask(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Update task status
   */
  updateTask(taskId: string, updates: Partial<TaskStatus>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    Object.assign(task, updates);
    
    // Calculate progress
    if (task.totalSectors > 0) {
      task.progress = Math.round((task.completedSectors / task.totalSectors) * 100);
    }

    // Update status based on completion
    if (task.completedSectors === task.totalSectors) {
      if (task.status === 'running') {
        task.status = 'completed';
        task.endTime = new Date();
      }
    }
  }

  /**
   * Add sector result
   */
  addSectorResult(
    taskId: string,
    sectorId: string,
    sectorName: string,
    status: 'success' | 'error',
    error?: string,
    companiesUpdated?: number
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.sectorResults.push({
      sectorId,
      sectorName,
      status,
      error,
      companiesUpdated,
    });

    task.completedSectors += 1;
    if (status === 'success') {
      task.successfulSectors += 1;
    } else {
      task.failedSectors += 1;
    }

    // Update progress
    if (task.totalSectors > 0) {
      task.progress = Math.round((task.completedSectors / task.totalSectors) * 100);
    }

    // Check if all sectors are done
    if (task.completedSectors === task.totalSectors && task.status === 'running') {
      task.status = 'completed';
      task.endTime = new Date();
    }
  }

  /**
   * Mark task as running
   */
  startTask(taskId: string): void {
    this.updateTask(taskId, { status: 'running', startTime: new Date() });
  }

  /**
   * Mark task as failed
   */
  failTask(taskId: string, error: string): void {
    this.updateTask(taskId, { status: 'failed', error, endTime: new Date() });
  }

  /**
   * Clean up old completed tasks (older than 1 hour)
   */
  cleanupOldTasks(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        task.endTime &&
        task.endTime < oneHourAgo
      ) {
        this.tasks.delete(taskId);
      }
    }
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): TaskStatus[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === 'running' || task.status === 'pending'
    );
  }
}

export const taskManager = new TaskManager();

// Clean up old tasks every 30 minutes
setInterval(() => {
  taskManager.cleanupOldTasks();
}, 30 * 60 * 1000);

