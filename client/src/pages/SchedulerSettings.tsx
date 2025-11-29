import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Clock, Play, Pause, Calendar, RefreshCw, Loader2, CheckCircle2, XCircle, AlertCircle, History, Eye, User, Upload, Download, Trash2, FileText, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Sector, BulkImportJob, BulkImportItem } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

// Helper function to format date
const formatTimeAgo = (date: string): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
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
  startTime?: string;
  endTime?: string;
  error?: string;
}

interface HistoryEntry {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string } | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
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
  error?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

interface BulkImportJobWithDetails {
  id: string;
  userId: string;
  fileName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  skippedItems: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  items?: BulkImportItemType[];
  stats?: {
    pending: number;
    processing: number;
    success: number;
    failed: number;
    skipped: number;
  };
}

interface BulkImportItemType {
  id: string;
  jobId: string;
  ticker: string;
  companyName: string;
  sectorName: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  resolvedTicker?: string;
  sectorId?: string;
  companyId?: string;
  error?: string;
  quartersScraped?: number;
  metricsScraped?: number;
  processedAt?: string;
  createdAt: string;
}

export default function SchedulerSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<HistoryEntry | null>(null);
  const [selectedBulkJob, setSelectedBulkJob] = useState<BulkImportJobWithDetails | null>(null);
  const [bulkJobSearch, setBulkJobSearch] = useState("");
  const [bulkItemFilter, setBulkItemFilter] = useState<"all" | "pending" | "success" | "failed" | "processing">("all");

  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  // Fetch task status
  const { data: taskStatus } = useQuery<TaskStatus>({
    queryKey: ["/api/v1/scheduler/task", currentTaskId],
    enabled: !!currentTaskId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if task is running
      const status = query.state.data;
      if (status?.status === 'running' || status?.status === 'pending') {
        return 2000;
      }
      return false;
    },
  });

  // Fetch history
  const { data: history, refetch: refetchHistory } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/v1/scheduler/history"],
    refetchInterval: 5000, // Refresh every 5 seconds to see updates
    select: (data) => {
      // Ensure we always return an array
      if (Array.isArray(data)) {
        return data;
      }
      return [];
    },
  });

  // Fetch bulk import jobs
  const { data: bulkImportJobs, refetch: refetchBulkJobs } = useQuery<BulkImportJobWithDetails[]>({
    queryKey: ["/api/v1/bulk-import/jobs"],
    retry: false,
    refetchInterval: (query) => {
      // Poll every 3 seconds if any job is running
      const jobs = query.state.data;
      if (Array.isArray(jobs) && jobs.some(job => job.status === 'running' || job.status === 'pending')) {
        return 3000;
      }
      return false;
    },
  });

  // Fetch selected bulk job details - use custom fetch to avoid query key issues
  const fetchJobDetails = async (jobId: string) => {
    try {
      const response = await apiRequest("GET", `/api/v1/bulk-import/jobs/${jobId}`);
      const data = await response.json();
      setSelectedBulkJob(data);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to load job details",
        variant: "destructive",
      });
    }
  };

  // Poll for job updates when viewing a running job
  useEffect(() => {
    if (!selectedBulkJob || selectedBulkJob.status !== 'running') return;

    const interval = setInterval(async () => {
      try {
        const response = await apiRequest("GET", `/api/v1/bulk-import/jobs/${selectedBulkJob.id}`);
        const data = await response.json();
        setSelectedBulkJob(data);
      } catch (err) {
        // Ignore errors during polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedBulkJob?.id, selectedBulkJob?.status]);


  // Start updating all sectors
  const startUpdateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/scheduler/update-all-sectors");
      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentTaskId(data.taskId);
      toast({
        title: "Update Started",
        description: `Started updating ${data.totalSectors} sectors. This will run in the background.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start sector update",
        variant: "destructive",
      });
    },
  });

  // Create bulk import job
  const createBulkImportMutation = useMutation({
    mutationFn: async (data: { fileName: string; items: { ticker: string; name: string; sector: string }[] }) => {
      const response = await apiRequest("POST", "/api/v1/bulk-import/jobs", data);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import Job Created",
        description: `Created job with ${data.job.totalItems} companies. Click "Start" to begin processing.`,
      });
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create import job",
        variant: "destructive",
      });
    },
  });

  // Start bulk import job
  const startBulkImportMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/v1/bulk-import/jobs/${jobId}/start`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Import Started",
        description: "Processing companies in the background. Progress will update automatically.",
      });
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start import",
        variant: "destructive",
      });
    },
  });

  // Cancel bulk import job
  const cancelBulkImportMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/v1/bulk-import/jobs/${jobId}/cancel`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Import Cancelled",
        description: "The import job has been cancelled.",
      });
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel import",
        variant: "destructive",
      });
    },
  });

  // Pause bulk import job
  const pauseBulkImportMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/v1/bulk-import/jobs/${jobId}/pause`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Import Paused",
        description: "The import job has been paused.",
      });
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to pause import",
        variant: "destructive",
      });
    },
  });

  // Resume bulk import job
  const resumeBulkImportMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/v1/bulk-import/jobs/${jobId}/resume`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Import Resumed",
        description: "The import job has resumed processing.",
      });
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resume import",
        variant: "destructive",
      });
    },
  });

  // Retry failed items in bulk import job
  const retryBulkImportMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/v1/bulk-import/jobs/${jobId}/retry`);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Retry Started",
        description: `Retrying ${data.retriedItems} failed items.`,
      });
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to retry import",
        variant: "destructive",
      });
    },
  });

  // Delete bulk import job
  const deleteBulkImportMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("DELETE", `/api/v1/bulk-import/jobs/${jobId}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Job Deleted",
        description: "The import job has been deleted.",
      });
      setSelectedBulkJob(null);
      refetchBulkJobs();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete job",
        variant: "destructive",
      });
    },
  });

  // Handle CSV file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim());

      // Skip header row
      const dataRows = lines.slice(1);

      const items: { ticker: string; name: string; sector: string }[] = [];

      for (const row of dataRows) {
        // Parse CSV with proper handling of quoted fields
        const matches = row.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g);
        if (matches && matches.length >= 3) {
          const cols = matches.map(m => {
            let val = m.replace(/^,/, "").trim();
            // Remove surrounding quotes and unescape double quotes
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1).replace(/""/g, '"');
            }
            return val;
          });

          if (cols[0] && cols[1] && cols[2]) {
            items.push({
              ticker: cols[0].trim(),
              name: cols[1].trim(),
              sector: cols[2].trim(),
            });
          }
        }
      }

      if (items.length === 0) {
        toast({
          title: "Invalid CSV",
          description: "No valid rows found. CSV should have columns: ticker, name, sector",
          variant: "destructive",
        });
        return;
      }

      createBulkImportMutation.mutate({
        fileName: file.name,
        items,
      });
    };

    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Download CSV export
  const downloadExport = async (jobId: string, status?: string) => {
    try {
      const url = `/api/v1/bulk-import/jobs/${jobId}/export${status ? `?status=${status}` : ""}`;
      const response = await apiRequest("GET", url);
      const blob = await response.blob();

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bulk-import-${jobId}-${status || "all"}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download CSV",
        variant: "destructive",
      });
    }
  };

  // Show toast when task completes
  useEffect(() => {
    if (taskStatus?.status === 'completed') {
      toast({
        title: "Update Completed",
        description: `Successfully updated ${taskStatus.successfulSectors} sectors. ${taskStatus.failedSectors} failed.`,
      });
    } else if (taskStatus?.status === 'failed') {
      toast({
        title: "Update Failed",
        description: taskStatus.error || "The update task failed",
        variant: "destructive",
      });
    }
  }, [taskStatus?.status, taskStatus?.successfulSectors, taskStatus?.failedSectors, taskStatus?.error, toast]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scheduler Settings</h1>
        <p className="text-muted-foreground mt-1">Manage automatic scraping schedules</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daily Automatic Scraping</CardTitle>
              <CardDescription>
                Scheduled to run daily at 6:00 AM (IST). Scrapes all companies in all sectors.
              </CardDescription>
            </div>
            <Badge variant="outline" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Default Daily Schedule</div>
                <div className="text-sm text-muted-foreground">
                  Cron: 0 6 * * * (6:00 AM daily)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Enabled</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This schedule automatically scrapes all companies in all sectors every morning.
              The scheduler is initialized when the server starts and runs continuously.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Update All Sectors</CardTitle>
              <CardDescription>
                Manually trigger an update for all sectors. This will scrape data for all companies in all sectors.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => startUpdateMutation.mutate()}
              disabled={startUpdateMutation.isPending || (taskStatus?.status === 'running')}
              className="min-w-[200px]"
            >
              {startUpdateMutation.isPending || (taskStatus?.status === 'running') ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {taskStatus?.status === 'running' ? 'Updating...' : 'Starting...'}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update All Sectors
                </>
              )}
            </Button>
            {taskStatus && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={taskStatus.status === 'completed' ? 'default' : taskStatus.status === 'failed' ? 'destructive' : 'secondary'}>
                  {taskStatus.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {taskStatus.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {taskStatus.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                  {taskStatus.status.charAt(0).toUpperCase() + taskStatus.status.slice(1)}
                </Badge>
              </div>
            )}
          </div>

          {taskStatus && (taskStatus.status === 'running' || taskStatus.status === 'completed' || taskStatus.status === 'failed') && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{taskStatus.progress}%</span>
                </div>
                <Progress value={taskStatus.progress} className="h-2" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Total Sectors</div>
                  <div className="text-2xl font-bold">{taskStatus.totalSectors}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Completed</div>
                  <div className="text-2xl font-bold">{taskStatus.completedSectors}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    Successful
                  </div>
                  <div className="text-2xl font-bold text-green-600">{taskStatus.successfulSectors}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-600" />
                    Failed
                  </div>
                  <div className="text-2xl font-bold text-red-600">{taskStatus.failedSectors}</div>
                </div>
              </div>

              {taskStatus.status === 'completed' && taskStatus.failedSectors > 0 && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-red-900 dark:text-red-100 mb-2">
                        {taskStatus.failedSectors} sector(s) failed to update
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {taskStatus.sectorResults
                          .filter(r => r.status === 'error')
                          .slice(0, 5)
                          .map((result, idx) => (
                            <div key={idx} className="text-sm text-red-800 dark:text-red-200">
                              <span className="font-medium">{result.sectorName}:</span> {result.error}
                            </div>
                          ))}
                        {taskStatus.sectorResults.filter(r => r.status === 'error').length > 5 && (
                          <div className="text-sm text-red-600 dark:text-red-300">
                            ... and {taskStatus.sectorResults.filter(r => r.status === 'error').length - 5} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {taskStatus.status === 'running' && taskStatus.sectorResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Recent Updates:</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {taskStatus.sectorResults.slice(-5).map((result, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        {result.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={result.status === 'error' ? 'text-red-600' : ''}>
                          {result.sectorName}
                          {result.companiesUpdated !== undefined && result.companiesUpdated > 0 && (
                            <span className="text-muted-foreground ml-2">
                              ({result.companiesUpdated} companies)
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> This will update all companies in all sectors. The process runs in the background
              and you will receive an email notification when it completes. You can monitor progress here in real-time.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Import Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Bulk Import Companies
              </CardTitle>
              <CardDescription>
                Upload a CSV file to bulk import companies and scrape their data. CSV format: ticker, name, sector
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={createBulkImportMutation.isPending}
              >
                {createBulkImportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload CSV
              </Button>
              <Button variant="outline" onClick={() => refetchBulkJobs()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bulkImportJobs && bulkImportJobs.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkImportJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium truncate max-w-[150px]">{job.fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            job.status === 'completed' ? 'default' :
                              job.status === 'failed' ? 'destructive' :
                                job.status === 'running' ? 'secondary' :
                                  job.status === 'paused' ? 'secondary' :
                                    job.status === 'cancelled' ? 'outline' : 'outline'
                          }
                          className={job.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : ''}
                        >
                          {job.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {job.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {job.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                          {job.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={job.totalItems > 0 ? (job.processedItems / job.totalItems) * 100 : 0}
                            className="h-2 w-20"
                          />
                          <span className="text-xs text-muted-foreground">
                            {job.processedItems}/{job.totalItems}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-x-2">
                          <span className="text-green-600">{job.successItems} ✓</span>
                          <span className="text-red-600">{job.failedItems} ✗</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(job.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {job.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => startBulkImportMutation.mutate(job.id)}
                              disabled={startBulkImportMutation.isPending}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Start
                            </Button>
                          )}

                          {job.status === 'running' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => pauseBulkImportMutation.mutate(job.id)}
                                disabled={pauseBulkImportMutation.isPending}
                              >
                                <Pause className="h-3 w-3 mr-1" />
                                Pause
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => cancelBulkImportMutation.mutate(job.id)}
                                disabled={cancelBulkImportMutation.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            </>
                          )}
                          {job.status === 'paused' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => resumeBulkImportMutation.mutate(job.id)}
                                disabled={resumeBulkImportMutation.isPending}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Resume
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => cancelBulkImportMutation.mutate(job.id)}
                                disabled={cancelBulkImportMutation.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            </>
                          )}
                          {/* Show Resume for any incomplete job (failed/completed with unprocessed items) */}
                          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
                            (job.processedItems < job.totalItems || job.failedItems > 0) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => resumeBulkImportMutation.mutate(job.id)}
                                  disabled={resumeBulkImportMutation.isPending}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  Resume
                                </Button>
                                {job.failedItems > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => retryBulkImportMutation.mutate(job.id)}
                                    disabled={retryBulkImportMutation.isPending}
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Retry Failed
                                  </Button>
                                )}
                              </>
                            )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => fetchJobDetails(job.id)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this job?")) {
                                  deleteBulkImportMutation.mutate(job.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No bulk import jobs yet</p>
              <p className="text-sm mt-2">Upload a CSV file with columns: ticker, name, sector</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Import Job Details Dialog */}
      <Dialog open={!!selectedBulkJob} onOpenChange={(open) => !open && setSelectedBulkJob(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bulk Import: {selectedBulkJob?.fileName}
            </DialogTitle>
            <DialogDescription>
              View import progress and download results
            </DialogDescription>
          </DialogHeader>

          {selectedBulkJob && (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">{selectedBulkJob.totalItems}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">{selectedBulkJob.processedItems}</div>
                  <div className="text-xs text-muted-foreground">Processed</div>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{selectedBulkJob.successItems}</div>
                  <div className="text-xs text-green-600">Success</div>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">{selectedBulkJob.failedItems}</div>
                  <div className="text-xs text-red-600">Failed</div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">{selectedBulkJob.skippedItems}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{selectedBulkJob.totalItems > 0 ? Math.round((selectedBulkJob.processedItems / selectedBulkJob.totalItems) * 100) : 0}%</span>
                </div>
                <Progress
                  value={selectedBulkJob.totalItems > 0 ? (selectedBulkJob.processedItems / selectedBulkJob.totalItems) * 100 : 0}
                  className="h-2"
                />
              </div>

              {/* Download Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExport(selectedBulkJob.id)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExport(selectedBulkJob.id, "success")}
                  className="text-green-600 border-green-600 hover:bg-green-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Success ({selectedBulkJob.successItems})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExport(selectedBulkJob.id, "failed")}
                  className="text-red-600 border-red-600 hover:bg-red-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Failed ({selectedBulkJob.failedItems})
                </Button>
              </div>

              {/* Filter Tabs */}
              <Tabs value={bulkItemFilter} onValueChange={(v) => setBulkItemFilter(v as any)}>
                <TabsList>
                  <TabsTrigger value="all">All ({selectedBulkJob.items?.length || 0})</TabsTrigger>
                  <TabsTrigger value="success">Success ({selectedBulkJob.stats?.success || 0})</TabsTrigger>
                  <TabsTrigger value="failed">Failed ({selectedBulkJob.stats?.failed || 0})</TabsTrigger>
                  <TabsTrigger value="pending">Pending ({selectedBulkJob.stats?.pending || 0})</TabsTrigger>
                  <TabsTrigger value="processing">Processing ({selectedBulkJob.stats?.processing || 0})</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Items Table */}
              <div className="flex-1 overflow-auto border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Resolved Ticker</TableHead>
                      <TableHead>Quarters</TableHead>
                      <TableHead>Metrics</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBulkJob.items
                      ?.filter(item => bulkItemFilter === "all" || item.status === bulkItemFilter)
                      .map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.ticker}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{item.companyName}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{item.sectorName}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === 'success' ? 'default' :
                                  item.status === 'failed' ? 'destructive' :
                                    item.status === 'processing' ? 'secondary' : 'outline'
                              }
                              className="text-xs"
                            >
                              {item.status === 'processing' && <Loader2 className="h-2 w-2 mr-1 animate-spin" />}
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.resolvedTicker || '-'}</TableCell>
                          <TableCell>{item.quartersScraped || 0}</TableCell>
                          <TableCell>{item.metricsScraped || 0}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-red-600">
                            {item.error || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Sector-Specific Schedules</CardTitle>
          <CardDescription>
            Configure custom scraping schedules for specific sectors (Coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Custom sector schedules will be available in a future update.</p>
            <p className="text-xs mt-2">
              For now, use the "Bulk Scrape Sector" button in the Sectors page to manually trigger scraping.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduler Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Timezone:</span>
            <span className="font-medium">Asia/Kolkata (IST)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Default Schedule:</span>
            <span className="font-medium">Daily at 6:00 AM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Sectors:</span>
            <span className="font-medium">{sectors?.length || 0}</span>
          </div>
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Note: The scheduler runs automatically in the background. You can also manually trigger scraping
              from the Sectors page using the "Bulk Scrape Sector" button.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Update History</CardTitle>
              <CardDescription>
                View history of all sector update operations, including who triggered them and detailed results.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {history && Array.isArray(history) && history.length > 0 ? (
            <div className="space-y-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Triggered By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history || []).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {entry.user?.name || entry.user?.email || "Unknown User"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === 'completed' ? 'default' :
                              entry.status === 'failed' ? 'destructive' :
                                entry.status === 'running' ? 'secondary' : 'outline'
                          }
                        >
                          {entry.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {entry.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {entry.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={entry.progress} className="h-2 w-24" />
                          <span className="text-sm text-muted-foreground">{entry.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-green-600 dark:text-green-400">{entry.successfulSectors} success</span>
                          {entry.failedSectors > 0 && (
                            <span className="text-red-600 dark:text-red-400 ml-2">{entry.failedSectors} failed</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatTimeAgo(entry.startedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Fetch full details
                            apiRequest("GET", `/api/v1/scheduler/history/${entry.id}`)
                              .then(res => res.json())
                              .then(data => setSelectedHistory(data))
                              .catch(err => {
                                toast({
                                  title: "Error",
                                  description: "Failed to load history details",
                                  variant: "destructive"
                                });
                              });
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No update history yet</p>
              <p className="text-sm mt-2">Trigger an update to see history here</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Details Dialog */}
      <Dialog open={!!selectedHistory} onOpenChange={(open) => !open && setSelectedHistory(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sector Update Details</DialogTitle>
            <DialogDescription>
              Detailed results for this sector update operation
            </DialogDescription>
          </DialogHeader>
          {selectedHistory && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Triggered By</div>
                  <div className="font-medium">{selectedHistory.user?.name || selectedHistory.user?.email || "Unknown"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge variant={selectedHistory.status === 'completed' ? 'default' : selectedHistory.status === 'failed' ? 'destructive' : 'secondary'}>
                    {selectedHistory.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Started</div>
                  <div className="font-medium text-sm">{new Date(selectedHistory.startedAt).toLocaleString()}</div>
                </div>
                {selectedHistory.completedAt && (
                  <div>
                    <div className="text-sm text-muted-foreground">Completed</div>
                    <div className="font-medium text-sm">{new Date(selectedHistory.completedAt).toLocaleString()}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Sectors</div>
                  <div className="text-2xl font-bold">{selectedHistory.totalSectors}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Completed</div>
                  <div className="text-2xl font-bold">{selectedHistory.completedSectors}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Successful
                  </div>
                  <div className="text-2xl font-bold text-green-600">{selectedHistory.successfulSectors}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Failed
                  </div>
                  <div className="text-2xl font-bold text-red-600">{selectedHistory.failedSectors}</div>
                </div>
              </div>

              {selectedHistory.error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-red-900 dark:text-red-100 mb-1">Error</div>
                      <div className="text-sm text-red-800 dark:text-red-200">{selectedHistory.error}</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2">Sector Results ({selectedHistory.sectorResults.length})</h3>
                <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sector</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Companies Updated</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedHistory.sectorResults.map((result, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{result.sectorName}</TableCell>
                          <TableCell>
                            <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                              {result.status === 'success' ? (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                              ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              {result.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{result.companiesUpdated ?? '—'}</TableCell>
                          <TableCell className="text-sm text-red-600 dark:text-red-400">
                            {result.error || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div >
  );
}

