import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Upload, ExternalLink, Search, CheckCircle2, FileText, Loader2, AlertCircle, MoreVertical, Filter, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, Download } from "lucide-react";
import { Link } from "wouter";
import type { Company, Sector, InsertCompany } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import MetricFilter from "@/components/MetricFilter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Schema without strict validation - we'll validate in submit handler
const companyFormSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  name: z.string().optional(),
  sectorId: z.string().optional(),
  marketCap: z.string().optional(),
  financialData: z.string().optional()
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

export default function CompanyManager() {
  const { toast } = useToast();
  
  // Helper function to get financial value as number - defined early using useCallback to avoid initialization issues
  const getFinancialValueNumber = useCallback((company: Company, key: string): number | null => {
    if (!company.financialData) return null;
    const data = company.financialData as any;
    const value = data[key];
    if (value === undefined || value === null) return null;
    const numValue = parseFloat(value);
    return isNaN(numValue) ? null : numValue;
  }, []);
  
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [bulkData, setBulkData] = useState("");
  const [detectingMetadata, setDetectingMetadata] = useState(false);
  const [detectedMetadata, setDetectedMetadata] = useState<{ companyName: string; detectedSector: string } | null>(null);
  const [useDetectedSector, setUseDetectedSector] = useState(true);
  const [scrapingStatus, setScrapingStatus] = useState<{ ticker: string; status: "scraping" | "success" | "error"; message?: string } | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSectorUpdateOpen, setBulkSectorUpdateOpen] = useState(false);
  const [bulkScrapeOpen, setBulkScrapeOpen] = useState(false);
  const [bulkSectorId, setBulkSectorId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(20);
  const [metricFilters, setMetricFilters] = useState<Array<{ metric: string; min: string; max: string }>>([]);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [sortField, setSortField] = useState<string>("updatedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState(false);

  const companiesQueryKey = selectedSector
    ? ["/api/companies", { sectorId: selectedSector }]
    : ["/api/companies"];

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: companiesQueryKey
  });

  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  // Filter companies based on search term
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    if (!searchTerm.trim()) return companies;

    const term = searchTerm.toLowerCase();
    return companies.filter(company =>
      company.ticker.toLowerCase().includes(term) ||
      company.name?.toLowerCase().includes(term)
    );
  }, [companies, searchTerm]);

  // Fetch quarterly data for metric filtering (only when metric filters are active)
  const activeMetricFilters = metricFilters.filter(f => f.metric);
  const tickersToFetch = useMemo(() => {
    return filteredCompanies.slice(0, 100).map(c => c.ticker).sort();
  }, [filteredCompanies]);
  
  const { data: quarterlyDataMap } = useQuery<Record<string, {
    ticker: string;
    quarters: Array<{
      quarter: string;
      metrics: Record<string, string | null>;
    }>;
  }>>({
    queryKey: ["/api/companies/quarterly-data-batch", tickersToFetch.length, tickersToFetch.slice(0, 10).join(",")],
    queryFn: async () => {
      if (activeMetricFilters.length === 0 || tickersToFetch.length === 0) return {};
      
      const data: Record<string, any> = {};
      await Promise.all(
        tickersToFetch.map(async (ticker) => {
          try {
            const res = await apiRequest("GET", `/api/v1/companies/${ticker}/data`);
            const result = await res.json();
            data[ticker] = result;
          } catch (error) {
            // Ignore errors for individual companies
          }
        })
      );
      return data;
    },
    enabled: activeMetricFilters.length > 0 && tickersToFetch.length > 0 && tickersToFetch.length <= 100,
  });

  // Apply metric filters
  const companiesWithMetricFilters = useMemo(() => {
    if (activeMetricFilters.length === 0 || !quarterlyDataMap) {
      return filteredCompanies;
    }

    return filteredCompanies.filter(company => {
      const companyData = quarterlyDataMap[company.ticker];
      if (!companyData || !companyData.quarters || companyData.quarters.length === 0) {
        return false; // Exclude companies without quarterly data when metric filters are active
      }

      // Get the most recent quarter's metrics
      const latestQuarter = companyData.quarters[companyData.quarters.length - 1];
      const metrics = latestQuarter.metrics || {};

      // Check all metric filters
      return activeMetricFilters.every(filter => {
        const metricValue = metrics[filter.metric];
        if (metricValue === null || metricValue === undefined) return false;

        const numValue = parseFloat(String(metricValue));
        if (isNaN(numValue) || !isFinite(numValue)) return false;

        const minStr = filter.min.trim();
        const maxStr = filter.max.trim();
        const min = minStr ? parseFloat(minStr) : null;
        const max = maxStr ? parseFloat(maxStr) : null;

        // Validate parsed values
        if (min !== null && (isNaN(min) || !isFinite(min))) return false;
        if (max !== null && (isNaN(max) || !isFinite(max))) return false;

        // Apply filters: exclude if value is below min or above max
        if (min !== null && numValue < min) return false;
        if (max !== null && numValue > max) return false;
        return true;
      });
    });
  }, [filteredCompanies, activeMetricFilters, quarterlyDataMap]);

  // Sort companies
  const sortedCompanies = useMemo(() => {
    const sorted = [...companiesWithMetricFilters];
    
    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortField) {
        case "ticker":
          aValue = a.ticker?.toLowerCase() || "";
          bValue = b.ticker?.toLowerCase() || "";
          break;
        case "name":
          aValue = a.name?.toLowerCase() || "";
          bValue = b.name?.toLowerCase() || "";
          break;
        case "updatedAt":
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        case "revenue":
          aValue = getFinancialValueNumber(a, "revenue") || 0;
          bValue = getFinancialValueNumber(b, "revenue") || 0;
          break;
        case "roe":
          aValue = getFinancialValueNumber(a, "roe") || 0;
          bValue = getFinancialValueNumber(b, "roe") || 0;
          break;
        case "pe":
          aValue = getFinancialValueNumber(a, "pe") || 0;
          bValue = getFinancialValueNumber(b, "pe") || 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [companiesWithMetricFilters, sortField, sortDirection]);

  // Pagination logic
  const totalPages = Math.ceil(sortedCompanies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompanies = sortedCompanies.slice(startIndex, endIndex);

  // Handle sort
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Sort icon component
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSector, metricFilters, sortField, sortDirection]);

  const createForm = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: { ticker: "", name: "", sectorId: "", marketCap: "", financialData: "" }
  });

  const editForm = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema)
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertCompany & { autoDetect?: boolean; detectedSector?: string }) => apiRequest("POST", "/api/companies", data),
    onSuccess: async (response) => {
      const company = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company created successfully" });

      // Start scraping automatically
      const ticker = company.ticker || createForm.getValues("ticker");
      if (ticker) {
        setScrapingStatus({ ticker, status: "scraping", message: "Fetching company data..." });

        try {
          const scrapeRes = await apiRequest("POST", "/api/v1/scraper/scrape/single", { ticker });
          if (scrapeRes.ok) {
            const scrapeResult = await scrapeRes.json();
            if (scrapeResult.success) {
              setScrapingStatus({
                ticker,
                status: "success",
                message: `Data fetched successfully! ${scrapeResult.quartersScraped || 0} quarters, ${scrapeResult.metricsScraped || 0} metrics`
              });
              toast({
                title: "Data fetched successfully",
                description: `Scraped ${scrapeResult.quartersScraped || 0} quarters and ${scrapeResult.metricsScraped || 0} metrics`
              });

              // Invalidate queries to refresh data
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", ticker] });
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", ticker, "data"] });
            } else {
              setScrapingStatus({
                ticker,
                status: "error",
                message: scrapeResult.error || "Failed to fetch data"
              });
              toast({
                title: "Scraping failed",
                description: scrapeResult.error || "Failed to fetch company data",
                variant: "destructive"
              });
            }
          } else {
            const errorData = await scrapeRes.json();
            setScrapingStatus({
              ticker,
              status: "error",
              message: errorData.error || "Failed to start scraping"
            });
            toast({
              title: "Scraping failed",
              description: errorData.error || "Failed to start scraping",
              variant: "destructive"
            });
          }
        } catch (error: any) {
          setScrapingStatus({
            ticker,
            status: "error",
            message: error.message || "Failed to fetch data"
          });
          toast({
            title: "Scraping failed",
            description: error.message || "Failed to fetch company data",
            variant: "destructive"
          });
        }

        // Clear scraping status after 5 seconds
        setTimeout(() => {
          setScrapingStatus(null);
        }, 5000);
      }

      setCreateOpen(false);
      createForm.reset();
      setDetectedMetadata(null);
      setUseDetectedSector(true);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create company", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertCompany> }) =>
      apiRequest("PUT", `/api/companies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company updated successfully" });
      setEditCompany(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update company", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company deleted successfully" });
      setDeleteCompany(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete company", description: error.message, variant: "destructive" });
    }
  });

  const [csvPreview, setCsvPreview] = useState<Array<{
    ticker: string;
    name?: string;
    sectorId?: string;
    sector?: string;
    verifiedTicker?: string;
    verifiedCompanyName?: string;
    verifiedSector?: string;
    isVerifying?: boolean;
    verificationError?: string;
  }>>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [autoScrapeAfterImport, setAutoScrapeAfterImport] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);

  const verifyTickerMutation = useMutation({
    mutationFn: async ({ companyName, index }: { companyName: string; index: number }) => {
      const res = await apiRequest("POST", "/api/v1/companies/verify-ticker", { companyName });
      return await res.json();
    },
    onSuccess: (data, variables) => {
      setCsvPreview(prev => prev.map((item, idx) =>
        idx === variables.index
          ? {
            ...item,
            verifiedTicker: data.success ? data.ticker : undefined,
            verifiedCompanyName: data.success ? data.companyName : undefined,
            verifiedSector: data.success ? data.detectedSector : undefined,
            isVerifying: false,
            verificationError: data.success ? undefined : data.message || "Verification failed"
          }
          : item
      ));
      if (data.success) {
        toast({
          title: "Ticker fetched",
          description: `Found ticker: ${data.ticker} for ${data.companyName}`
        });
      } else {
        toast({
          title: "Ticker not found",
          description: data.message || "Company not found on Screener.in",
          variant: "destructive"
        });
      }
    },
    onError: (error: Error, variables) => {
      setCsvPreview(prev => prev.map((item, idx) =>
        idx === variables.index
          ? { ...item, isVerifying: false, verificationError: error.message }
          : item
      ));
      toast({
        title: "Failed to fetch ticker",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const verifyAllTickers = async () => {
    setVerifyingAll(true);
    const companiesToVerify = csvPreview.filter(c => c.name && !c.verifiedTicker);

    for (let i = 0; i < companiesToVerify.length; i++) {
      const company = companiesToVerify[i];
      if (!company.name) continue;

      // Update state to show verifying
      setCsvPreview(prev => prev.map((item, idx) =>
        item.name === company.name
          ? { ...item, isVerifying: true, verificationError: undefined }
          : item
      ));

      try {
        const res = await apiRequest("POST", "/api/v1/companies/verify-ticker", { companyName: company.name });
        const data = await res.json();

        setCsvPreview(prev => prev.map((item, idx) =>
          item.name === company.name
            ? {
              ...item,
              verifiedTicker: data.success ? data.ticker : undefined,
              verifiedCompanyName: data.success ? data.companyName : undefined,
              verifiedSector: data.success ? data.detectedSector : undefined,
              isVerifying: false,
              verificationError: data.success ? undefined : data.message || "Verification failed"
            }
            : item
        ));

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        setCsvPreview(prev => prev.map((item, idx) =>
          item.name === company.name
            ? { ...item, isVerifying: false, verificationError: error.message }
            : item
        ));
      }
    }

    setVerifyingAll(false);
    const successCount = csvPreview.filter(c => c.verifiedTicker).length;
    toast({
      title: "Bulk fetch completed",
      description: `Fetched tickers for ${successCount} out of ${companiesToVerify.length} companies`
    });
  };

  const bulkImportMutation = useMutation({
    mutationFn: (data: { companies: Array<{ ticker: string; name?: string; sectorId?: string; sector?: string }>; autoScrape?: boolean }) =>
      apiRequest("POST", "/api/v1/companies/bulk-import", data),
    onSuccess: async (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });

      const successMsg = `${result.success} successful, ${result.failed} failed`;

      if (result.failed > 0 && result.errors) {
        const errorDetails = result.errors.slice(0, 5).map((e: any) => `${e.ticker}: ${e.error}`).join(', ');
        toast({
          title: `Import completed with errors`,
          description: `${successMsg}. First errors: ${errorDetails}`,
          variant: result.success === 0 ? "destructive" : "default"
        });
      } else {
        toast({
          title: `Import completed`,
          description: successMsg
        });
      }

      // Trigger scraping if requested
      if (autoScrapeAfterImport && result.success > 0 && result.importedTickers && result.importedTickers.length > 0) {
        toast({
          title: "Starting data scraping",
          description: `Scraping data for ${result.importedTickers.length} companies. This may take a while.`
        });
        // Trigger scraping for all imported companies using existing bulk endpoint
        try {
          const scrapeRes = await apiRequest("POST", "/api/v1/scraper/scrape", {
            tickers: result.importedTickers
          });
          const scrapeResult = await scrapeRes.json();
          toast({
            title: "Scraping started",
            description: `Scraping initiated for ${result.importedTickers.length} companies. Check the scraper status for progress.`
          });
        } catch (error: any) {
          toast({
            title: "Scraping failed to start",
            description: error.message,
            variant: "destructive"
          });
        }
      }

      setBulkOpen(false);
      setBulkData("");
      setCsvPreview([]);
      setCsvFile(null);
      setAutoScrapeAfterImport(false);
    },
    onError: (error: Error) => {
      toast({ title: "Bulk import failed", description: error.message, variant: "destructive" });
    }
  });

  const parseFinancialData = (jsonString: string) => {
    if (!jsonString || jsonString.trim() === "") return null;
    try {
      return JSON.parse(jsonString);
    } catch {
      throw new Error("Invalid JSON format for financial data");
    }
  };

  // Export companies data to CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const response = await apiRequest("GET", "/api/v1/companies/export");
      const blob = await response.blob();

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `companies_export_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast({
        title: "Export Successful",
        description: "Companies data exported to CSV successfully",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export companies data",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const parseCSV = (csvText: string): Array<{ ticker: string; name?: string; sectorId?: string; sector?: string }> => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // Handle CSV with quoted values (common in Excel exports)
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const tickerIndex = headers.findIndex(h => h === 'ticker' || h === 'symbol');
    const nameIndex = headers.findIndex(h => h === 'name' || h === 'company name' || h === 'company');
    const sectorIndex = headers.findIndex(h => h === 'sector' || h === 'sectorid' || h === 'sector id');

    if (tickerIndex === -1) {
      throw new Error("CSV must have a 'ticker' or 'symbol' column");
    }

    return lines.slice(1).map(line => {
      const values = parseCSVLine(line).map(v => v.trim().replace(/^"|"$/g, ''));
      const result: { ticker: string; name?: string; sectorId?: string; sector?: string } = {
        ticker: values[tickerIndex] || '',
      };

      if (nameIndex !== -1 && values[nameIndex]) {
        result.name = values[nameIndex];
      }

      if (sectorIndex !== -1 && values[sectorIndex]) {
        const sectorName = values[sectorIndex];
        // Try to find sector by name first
        const sector = sectors?.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
        if (sector) {
          result.sectorId = sector.id;
        } else {
          // Keep sector name for backend to create it
          result.sector = sectorName;
        }
      }

      return result;
    }).filter(row => row.ticker);
  };

  const handleCSVUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = parseCSV(text);
        setCsvPreview(parsed);
        setCsvFile(file);
        toast({ title: `Parsed ${parsed.length} companies from CSV` });
      } catch (error: any) {
        toast({ title: "CSV parsing failed", description: error.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleBulkImport = () => {
    let companiesToImport: Array<{ ticker: string; name?: string; sectorId?: string; sector?: string }> = [];

    if (csvPreview.length > 0) {
      // Use verified ticker if available, otherwise use original ticker
      companiesToImport = csvPreview.map(company => ({
        ticker: company.verifiedTicker || company.ticker,
        name: company.verifiedCompanyName || company.name,
        sectorId: company.sectorId,
        sector: company.verifiedSector || company.sector,
      }));
    } else if (bulkData.trim()) {
      try {
        const parsed = JSON.parse(bulkData);
        if (Array.isArray(parsed)) {
          companiesToImport = parsed.map((item: any) => ({
            ticker: item.ticker,
            name: item.name,
            sectorId: item.sectorId,
            sector: item.sector, // Support sector name in JSON too
          }));
        } else {
          throw new Error("JSON must be an array");
        }
      } catch (error: any) {
        toast({ title: "Invalid JSON", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      toast({ title: "No data to import", variant: "destructive" });
      return;
    }

    bulkImportMutation.mutate({
      companies: companiesToImport,
      autoScrape: autoScrapeAfterImport
    });
  };

  const handleCreateSubmit = (data: CompanyFormData) => {
    try {
      // If we have detected metadata, use auto-detection
      const useAutoDetect = !!detectedMetadata;

      // Validate: if not auto-detecting, name and sectorId are required
      if (!useAutoDetect && (!data.name || !data.sectorId)) {
        toast({
          title: "Validation error",
          description: "Name and sector are required when not using auto-detection",
          variant: "destructive"
        });
        return;
      }

      const insertData: InsertCompany & { autoDetect?: boolean; detectedSector?: string } = {
        ticker: data.ticker,
        name: data.name || (detectedMetadata?.companyName) || "",
        sectorId: data.sectorId || undefined, // Allow undefined for auto-detection
        marketCap: data.marketCap ? data.marketCap : undefined,
        financialData: parseFinancialData(data.financialData || ""),
        autoDetect: useAutoDetect,
        detectedSector: detectedMetadata?.detectedSector,
      };
      createMutation.mutate(insertData);
    } catch (error: any) {
      toast({ title: "Validation error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditSubmit = (data: CompanyFormData) => {
    if (!editCompany) return;
    try {
      const updateData: Partial<InsertCompany> = {
        ticker: data.ticker,
        name: data.name,
        sectorId: data.sectorId,
        marketCap: data.marketCap ? data.marketCap : undefined,
        financialData: parseFinancialData(data.financialData || "")
      };
      updateMutation.mutate({ id: editCompany.id, data: updateData });
    } catch (error: any) {
      toast({ title: "Validation error", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (company: Company) => {
    setEditCompany(company);
    editForm.reset({
      ticker: company.ticker,
      name: company.name,
      sectorId: company.sectorId,
      marketCap: company.marketCap?.toString() || "",
      financialData: company.financialData ? JSON.stringify(company.financialData, null, 2) : ""
    });
  };

  const getSectorName = (sectorId: string) => {
    return sectors?.find(s => s.id === sectorId)?.name || "Unknown";
  };

  const getFinancialValue = (company: Company, key: string): string => {
    if (!company.financialData) return "—";
    const data = company.financialData as any;
    const value = data[key];
    if (value === undefined || value === null) return "—";

    // Format currency values (revenue, marketCap) with ₹ symbol
    if (key === "revenue" || key === "marketCap") {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return String(value);

      if (Math.abs(numValue) >= 10000000) {
        return `₹${(numValue / 10000000).toFixed(2)} Cr`;
      }
      if (Math.abs(numValue) >= 100000) {
        return `₹${(numValue / 100000).toFixed(2)} L`;
      }
      if (Math.abs(numValue) >= 1000) {
        return `₹${(numValue / 1000).toFixed(2)} K`;
      }
      return `₹${numValue.toFixed(2)}`;
    }

    // Format percentages (roe, roce, etc.)
    if (key === "roe" || key === "roce" || key.includes("%")) {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return String(value);
      return `${numValue.toFixed(2)}%`;
    }

    return String(value);
  };

  // Multi-select handlers
  const toggleSelectCompany = (companyId: string) => {
    setSelectedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!companiesWithMetricFilters) return;
    if (selectedCompanies.size === companiesWithMetricFilters.length) {
      setSelectedCompanies(new Set());
    } else {
      setSelectedCompanies(new Set(companiesWithMetricFilters.map(c => c.id)));
    }
  };

  const clearSelection = () => {
    setSelectedCompanies(new Set());
  };

  // Bulk operations
  const bulkDeleteMutation = useMutation({
    mutationFn: async (companyIds: string[]) => {
      const res = await apiRequest("POST", "/api/companies/bulk-delete", { companyIds });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      clearSelection();
      toast({
        title: `Successfully deleted ${data.deleted} companies`,
        description: `All selected companies have been deleted along with their related data.`
      });
      setBulkDeleteOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Bulk delete failed", description: error.message, variant: "destructive" });
    }
  });

  const bulkSectorUpdateMutation = useMutation({
    mutationFn: async ({ companyIds, sectorId }: { companyIds: string[]; sectorId: string }) => {
      const results = await Promise.allSettled(
        companyIds.map(id => apiRequest("PUT", `/api/companies/${id}`, { sectorId }))
      );
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.status === "fulfilled").length;

      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      clearSelection();
      setBulkSectorUpdateOpen(false);
      setBulkSectorId("");

      toast({ title: `Successfully updated ${successCount} companies` });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
    }
  });

  const bulkScrapeMutation = useMutation({
    mutationFn: async (companyIds: string[]) => {
      const selectedCompaniesData = companies?.filter(c => companyIds.includes(c.id)) || [];
      const tickers = selectedCompaniesData.map(c => c.ticker);

      const res = await apiRequest("POST", "/api/v1/scraper/scrape", { tickers });
      return res.json();
    },
    onSuccess: () => {
      clearSelection();
      setBulkScrapeOpen(false);
      toast({
        title: "Bulk scraping started",
        description: "Scraping data for selected companies. This may take a while."
      });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk scrape failed", description: error.message, variant: "destructive" });
    }
  });

  const handleBulkDelete = () => {
    if (selectedCompanies.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedCompanies));
  };

  const handleBulkSectorUpdate = () => {
    if (selectedCompanies.size === 0 || !bulkSectorId) return;
    bulkSectorUpdateMutation.mutate({
      companyIds: Array.from(selectedCompanies),
      sectorId: bulkSectorId
    });
  };

  const handleBulkScrape = () => {
    if (selectedCompanies.size === 0) return;
    bulkScrapeMutation.mutate(Array.from(selectedCompanies));
  };

  return (
    <div className="space-y-6">
      {scrapingStatus && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {scrapingStatus.status === "scraping" && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Getting data for {scrapingStatus.ticker}...</p>
                    <p className="text-sm text-muted-foreground">{scrapingStatus.message}</p>
                  </div>
                </>
              )}
              {scrapingStatus.status === "success" && (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium text-green-600">Data fetched successfully!</p>
                    <p className="text-sm text-muted-foreground">{scrapingStatus.message}</p>
                  </div>
                </>
              )}
              {scrapingStatus.status === "error" && (
                <>
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-medium text-red-600">Failed to fetch data</p>
                    <p className="text-sm text-muted-foreground">{scrapingStatus.message}</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Company Management</h1>
          <p className="text-muted-foreground mt-1">Manage companies and their financial data</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportCSV}
            disabled={exporting}
            data-testid="button-export-csv"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export CSV
          </Button>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-bulk-import">
                <Upload className="h-4 w-4 mr-2" />
                Bulk Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="dialog-bulk-import">
              <DialogHeader>
                <DialogTitle>Bulk Import Companies</DialogTitle>
                <DialogDescription>Import multiple companies from JSON or CSV data</DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="json">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="json">JSON Upload</TabsTrigger>
                  <TabsTrigger value="csv">CSV Upload</TabsTrigger>
                </TabsList>
                <TabsContent value="json" className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">JSON Data</label>
                    <Textarea
                      placeholder='[{"ticker": "AAPL", "name": "Apple Inc.", "sectorId": "...", "marketCap": "2500000000000", "financialData": {"revenue": 394328, "roe": 147.3}}]'
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      className="font-mono text-xs min-h-[300px]"
                      data-testid="input-bulk-json"
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste an array of company objects. Each must include: ticker, name, and optionally sectorId or sector (sector name)
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-scrape-json"
                      checked={autoScrapeAfterImport}
                      onCheckedChange={setAutoScrapeAfterImport}
                    />
                    <Label htmlFor="auto-scrape-json">Auto-scrape data after import</Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setBulkOpen(false)} data-testid="button-cancel-bulk">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleBulkImport}
                      disabled={bulkImportMutation.isPending}
                      data-testid="button-submit-bulk"
                    >
                      {bulkImportMutation.isPending ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="csv" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="csv-file">Upload CSV File</Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={(e) => e.target.files && handleCSVUpload(e.target.files[0])}
                    />
                    <p className="text-xs text-muted-foreground">
                      Upload a CSV file with 'ticker', 'name', and 'sector' columns. Sectors will be created automatically if they don't exist.
                    </p>
                  </div>
                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-md font-semibold">CSV Preview ({csvPreview.length} companies)</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={verifyAllTickers}
                          disabled={verifyingAll || csvPreview.filter(c => c.name && !c.verifiedTicker).length === 0}
                          title="Fetch correct tickers from screener.in for all companies"
                        >
                          {verifyingAll ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Fetching...
                            </>
                          ) : (
                            <>
                              <Search className="h-4 w-4 mr-2" />
                              Get All Tickers
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="h-[300px] w-full rounded-md border overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Original Ticker</TableHead>
                              <TableHead>Company Name</TableHead>
                              <TableHead>Verified Ticker</TableHead>
                              <TableHead>Sector</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {csvPreview.map((company, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-mono text-sm">{company.ticker}</TableCell>
                                <TableCell>{company.name || "—"}</TableCell>
                                <TableCell>
                                  {company.isVerifying ? (
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span className="text-xs text-muted-foreground">Fetching...</span>
                                    </div>
                                  ) : company.verifiedTicker ? (
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                                      <span className="font-mono text-sm font-semibold text-green-600">{company.verifiedTicker}</span>
                                    </div>
                                  ) : company.verificationError ? (
                                    <span className="text-xs text-red-600">{company.verificationError}</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Not fetched</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {company.verifiedSector || (
                                    company.sectorId
                                      ? sectors?.find(s => s.id === company.sectorId)?.name || "Unknown"
                                      : company.sector || "Auto-detect"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {company.name && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setCsvPreview(prev => prev.map((item, idx) =>
                                          idx === index ? { ...item, isVerifying: true, verificationError: undefined } : item
                                        ));
                                        verifyTickerMutation.mutate({ companyName: company.name!, index });
                                      }}
                                      disabled={verifyTickerMutation.isPending || company.isVerifying}
                                      title="Fetch correct ticker from screener.in"
                                    >
                                      {company.isVerifying ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Fetching...
                                        </>
                                      ) : (
                                        <>
                                          <Search className="h-3 w-3 mr-1" />
                                          Get Ticker
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-scrape-csv"
                      checked={autoScrapeAfterImport}
                      onCheckedChange={setAutoScrapeAfterImport}
                    />
                    <Label htmlFor="auto-scrape-csv">Auto-scrape data after import</Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleBulkImport}
                      disabled={bulkImportMutation.isPending || csvPreview.length === 0}
                    >
                      {bulkImportMutation.isPending ? "Importing..." : "Import CSV"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) {
              // Reset form and state when dialog closes
              createForm.reset();
              setDetectedMetadata(null);
              setUseDetectedSector(true);
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-company">
                <Plus className="h-4 w-4 mr-2" />
                Create Company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="dialog-create-company">
              <DialogHeader>
                <DialogTitle>Create New Company</DialogTitle>
                <DialogDescription>Add a new company to the system</DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                  <TabsTrigger value="ticker">Add by Ticker</TabsTrigger>
                </TabsList>
                <TabsContent value="manual">
                  <Form {...createForm}>
                    <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createForm.control}
                          name="ticker"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ticker</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-company-ticker" placeholder="AAPL" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="sectorId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sector</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-sector">
                                    <SelectValue placeholder="Select sector" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {sectors?.map((sector) => (
                                    <SelectItem key={sector.id} value={sector.id}>
                                      {sector.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={createForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-company-name" placeholder="Apple Inc." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="marketCap"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Market Cap (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-market-cap" placeholder="2500000000000" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="financialData"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Financial Data (JSON, Optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                data-testid="input-financial-data"
                                placeholder='{"revenue": 394328, "roe": 147.3, "pe": 28.5}'
                                className="font-mono text-xs"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-company">
                          {createMutation.isPending ? "Creating..." : "Create Company"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>
                <TabsContent value="ticker">
                  <Form {...createForm}>
                    <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                      <FormField
                        control={createForm.control}
                        name="ticker"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ticker</FormLabel>
                            <div className="flex space-x-2">
                              <FormControl>
                                <Input {...field} data-testid="input-ticker-autodetect" placeholder="RELIANCE" />
                              </FormControl>
                              <Button
                                type="button"
                                onClick={async () => {
                                  const ticker = createForm.getValues("ticker");
                                  if (!ticker) {
                                    toast({ title: "Please enter a ticker", variant: "destructive" });
                                    return;
                                  }
                                  setDetectingMetadata(true);
                                  try {
                                    const res = await apiRequest("GET", `/api/v1/companies/metadata/${ticker}`);
                                    const metadata = await res.json();
                                    if (metadata.exists) {
                                      setDetectedMetadata({
                                        companyName: metadata.companyName,
                                        detectedSector: metadata.detectedSector,
                                      });
                                      createForm.setValue("name", metadata.companyName);
                                      if (useDetectedSector && metadata.detectedSector) {
                                        // Try to find existing sector by name
                                        const sector = sectors?.find(s => s.name === metadata.detectedSector);
                                        if (sector) {
                                          createForm.setValue("sectorId", sector.id);
                                        } else {
                                          // Sector doesn't exist yet - backend will create it
                                          // Clear sectorId so backend handles it
                                          createForm.setValue("sectorId", "");
                                        }
                                      }
                                    } else {
                                      toast({ title: "Company not found", description: `Ticker ${ticker} not found on Screener.in`, variant: "destructive" });
                                    }
                                  } catch (error: any) {
                                    toast({ title: "Failed to detect company", description: error.message, variant: "destructive" });
                                  } finally {
                                    setDetectingMetadata(false);
                                  }
                                }}
                                disabled={detectingMetadata}
                              >
                                {detectingMetadata ? "Detecting..." : <><Search className="h-4 w-4 mr-2" /> Detect Company</>}
                              </Button>
                            </div>
                            <FormDescription>Enter a company ticker to auto-detect its name and sector from Screener.in.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {detectedMetadata && (
                        <Card className="p-4 space-y-2">
                          <CardTitle className="text-lg">Detected Information</CardTitle>
                          <CardContent className="p-0 space-y-1">
                            <p><strong>Company Name:</strong> {detectedMetadata.companyName}</p>
                            <p><strong>Detected Sector:</strong> {detectedMetadata.detectedSector}</p>
                            <div className="flex items-center space-x-2 mt-2">
                              <Switch
                                id="use-detected-sector"
                                checked={useDetectedSector}
                                onCheckedChange={setUseDetectedSector}
                              />
                              <Label htmlFor="use-detected-sector">Use detected sector</Label>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      <FormField
                        control={createForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-company-name-autodetect" placeholder="Reliance Industries Ltd" disabled={!!detectedMetadata} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="sectorId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={useDetectedSector && !!detectedMetadata}>
                              <FormControl>
                                <SelectTrigger data-testid="select-sector-autodetect">
                                  <SelectValue placeholder="Select sector" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sectors?.map((sector) => (
                                  <SelectItem key={sector.id} value={sector.id}>
                                    {sector.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createMutation.isPending || !createForm.getValues("ticker") || (!createForm.getValues("name") && !detectedMetadata)}
                        >
                          {createMutation.isPending ? "Creating..." : "Create Company"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Companies</CardTitle>
              <CardDescription>
                {isLoading ? "Loading..." : `${companies?.length || 0} companies`}
                {selectedCompanies.size > 0 && ` • ${selectedCompanies.size} selected`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies or tickers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[250px]"
                />
              </div>
              <Select value={selectedSector || "all"} onValueChange={(value) => setSelectedSector(value === "all" ? "" : value)}>
                <SelectTrigger className="w-[200px]" data-testid="select-filter-sector">
                  <SelectValue placeholder="All sectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors</SelectItem>
                  {sectors?.map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Metric Filters
                    <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <MetricFilter filters={metricFilters} onFiltersChange={setMetricFilters} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Toolbar */}
          {selectedCompanies.size > 0 && (
            <div className="mb-4 p-4 bg-muted/50 rounded-lg border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {selectedCompanies.size} company{selectedCompanies.size !== 1 ? 'ies' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-7 text-xs"
                >
                  Clear selection
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="h-4 w-4 mr-2" />
                      Bulk Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Bulk Operations</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setBulkScrapeOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Scrape Data
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkSectorUpdateOpen(true)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Update Sector
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading companies...</div>
          ) : !companiesWithMetricFilters || companiesWithMetricFilters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || activeMetricFilters.length > 0 ? "No companies match your filters." : (selectedSector ? "No companies found. Try selecting a different sector." : "No companies found. Create one to get started.")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={companiesWithMetricFilters && companiesWithMetricFilters.length > 0 && selectedCompanies.size === companiesWithMetricFilters.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all companies"
                        />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("ticker")}
                      >
                        <div className="flex items-center">
                          Ticker
                          <SortIcon field="ticker" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("name")}
                      >
                        <div className="flex items-center">
                          Name
                          <SortIcon field="name" />
                        </div>
                      </TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("revenue")}
                      >
                        <div className="flex items-center justify-end">
                          Revenue
                          <SortIcon field="revenue" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("roe")}
                      >
                        <div className="flex items-center justify-end">
                          ROE %
                          <SortIcon field="roe" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("pe")}
                      >
                        <div className="flex items-center justify-end">
                          P/E
                          <SortIcon field="pe" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("updatedAt")}
                      >
                        <div className="flex items-center justify-end">
                          Last Updated
                          <SortIcon field="updatedAt" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCompanies.map((company) => (
                    <TableRow
                      key={company.id}
                      data-testid={`row-company-${company.ticker}`}
                      className={selectedCompanies.has(company.id) ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedCompanies.has(company.id)}
                          onCheckedChange={() => toggleSelectCompany(company.id)}
                          aria-label={`Select ${company.ticker}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-bold">
                        <Link href={`/company/id/${company.id}`}>
                          <button className="hover:text-primary transition-colors flex items-center gap-1" data-testid={`link-company-${company.ticker}`}>
                            {company.ticker}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </Link>
                      </TableCell>
                      <TableCell>{company.name}</TableCell>
                      <TableCell className="text-muted-foreground">{getSectorName(company.sectorId)}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "revenue")}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "roe")}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "pe")}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(company.updatedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(company)}
                            data-testid={`button-edit-${company.ticker}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteCompany(company)}
                            data-testid={`button-delete-${company.ticker}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage > 1) setCurrentPage(currentPage - 1);
                          }}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCurrentPage(page);
                                }}
                                isActive={currentPage === page}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        }
                        return null;
                      })}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                          }}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                  <div className="text-center text-sm text-muted-foreground mt-2">
                    Showing {startIndex + 1} to {Math.min(endIndex, sortedCompanies.length)} of {sortedCompanies.length} companies
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editCompany} onOpenChange={(open) => !open && setEditCompany(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-company">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update company information</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="ticker"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticker</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-ticker" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="sectorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sector</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-sector">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sectors?.map((sector) => (
                            <SelectItem key={sector.id} value={sector.id}>
                              {sector.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="marketCap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Market Cap (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-market-cap" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="financialData"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Financial Data (JSON, Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="input-edit-financial-data"
                        className="font-mono text-xs min-h-[120px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditCompany(null)} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Updating..." : "Update Company"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCompany} onOpenChange={(open) => !open && setDeleteCompany(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteCompany?.ticker} - {deleteCompany?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCompany && deleteMutation.mutate(deleteCompany.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
