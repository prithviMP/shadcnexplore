import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, TrendingUp, Layers, Clock, Filter, Search, List, Grid3x3, ExternalLink, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import SignalBadge from "@/components/SignalBadge";
import { Link, useLocation } from "wouter";
import type { Company, Sector, Signal } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import MetricFilter from "@/components/MetricFilter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [marketCapMin, setMarketCapMin] = useState<string>("");
  const [marketCapMax, setMarketCapMax] = useState<string>("");
  const [roeMin, setRoeMin] = useState<string>("");
  const [roeMax, setRoeMax] = useState<string>("");
  const [peMin, setPeMin] = useState<string>("");
  const [peMax, setPeMax] = useState<string>("");
  const [revenueMin, setRevenueMin] = useState<string>("");
  const [revenueMax, setRevenueMax] = useState<string>("");
  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(20);
  const [metricFilters, setMetricFilters] = useState<Array<{ metric: string; min: string; max: string }>>([]);
  const [sortField, setSortField] = useState<string>("updatedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: sectors, isLoading: sectorsLoading } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
  });

  const { data: allSignals, isLoading: signalsLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
  });

  // Fetch signal status
  const { data: signalStatus, isLoading: signalStatusLoading } = useQuery<{
    totalSignals: number;
    staleSignals: number;
    lastCalculationTime: string | null;
    signalsByType: { signal: string; count: number }[];
    queue: {
      queueLength: number;
      activeJob: any;
      isProcessing: boolean;
    };
  }>({
    queryKey: ["/api/v1/signals/status"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch last scheduler activity
  const { data: lastActivityData } = useQuery<{
    lastActivity: {
      type: "scrape" | "sector_update";
      timestamp: string;
      details?: {
        ticker?: string;
        companiesUpdated?: number;
        totalSectors?: number;
        completedSectors?: number;
      };
    } | null;
  }>({
    queryKey: ["/api/v1/scheduler/last-activity"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch signal distribution (supports custom signals)
  const { data: signalDistributionData } = useQuery<{
    distribution: { signal: string; count: number }[];
  }>({
    queryKey: ["/api/v1/signals/distribution"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/signals/distribution");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshSignalsMutation = useMutation({
    mutationFn: async (incremental: boolean) => {
      const res = await apiRequest("POST", "/api/signals/calculate", {
        incremental,
        async: true,
        batchSize: 50,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Signal refresh started",
        description: `Job ${data.jobId} has been queued. Signals will be updated in the background.`,
      });
      // Refetch signal status after a short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/signals/status"] });
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start signal refresh",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsRefreshing(false);
    },
  });

  const handleRefreshSignals = (incremental = true) => {
    setIsRefreshing(true);
    refreshSignalsMutation.mutate(incremental);
  };

  const isLoading = companiesLoading || sectorsLoading || signalsLoading;

  // Calculate stats from real data
  const stats = {
    totalCompanies: companies?.length || 0,
    activeSignals: allSignals?.filter(s => s.signal !== "HOLD").length || 0,
    sectors: sectors?.length || 0,
    lastUpdate: (() => {
      // Prioritize scheduler activity over company updatedAt
      if (lastActivityData?.lastActivity?.timestamp) {
        return formatDistanceToNow(new Date(lastActivityData.lastActivity.timestamp), { addSuffix: true });
      }
      // Fallback to most recent company update
      if (companies && companies.length > 0) {
        return formatDistanceToNow(new Date(Math.max(...companies.map(c => new Date(c.updatedAt).getTime()))), { addSuffix: true });
      }
      return "Never";
    })(),
    lastSignalCalculation: signalStatus?.lastCalculationTime
      ? formatDistanceToNow(new Date(signalStatus.lastCalculationTime), { addSuffix: true })
      : "Never",
    staleSignals: signalStatus?.staleSignals || 0,
  };

  // Get sector overview with signal counts
  const sectorOverview = sectors?.map(sector => {
    const sectorCompanies = companies?.filter(c => c.sectorId === sector.id) || [];
    const sectorSignals = allSignals?.filter(signal =>
      sectorCompanies.some(c => c.id === signal.companyId)
    ) || [];

    return {
      id: sector.id,
      name: sector.name,
      companies: sectorCompanies.length,
      buySignals: sectorSignals.filter(s => s.signal === "BUY").length,
      sellSignals: sectorSignals.filter(s => s.signal === "SELL").length,
      holdSignals: sectorSignals.filter(s => s.signal === "HOLD").length,
    };
  }) || [];

  // Get recent signals (only include signals with valid companies)
  const recentSignals = allSignals
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(signal => {
      const company = companies?.find(c => c.id === signal.companyId);
      if (!company) return null; // Skip signals without valid companies

      const sector = sectors?.find(s => s.id === company.sectorId);
      return {
        ticker: company.ticker,
        company: company.name,
        sector: sector?.name || "Unknown",
        signal: signal.signal as "BUY" | "SELL" | "HOLD",
        metadata: signal.metadata
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null) // Remove null entries
    .slice(0, 5) || [];

  // Signal distribution (grouped counts from backend, supports custom signals)
  const rawSignalDistribution = useMemo(() => {
    return (signalDistributionData?.distribution || [])
      .filter((d) => d.signal && d.signal.trim() !== "")
      .map((d) => ({ signal: d.signal, count: d.count }));
  }, [signalDistributionData]);

  const sortedSignalDistribution = useMemo(() => {
    return [...rawSignalDistribution].sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal));
  }, [rawSignalDistribution]);

  // Fixed colors for standard signals
  const fixedSignalColors: Record<string, string> = {
    "BUY": "#22c55e",      // Green (emerald-500)
    "SELL": "#ef4444",     // Red (red-500)
    "HOLD": "#f59e0b",     // Amber/Yellow (amber-500)
    "Check_OPM (Sell)": "#f97316", // Orange
    "No Signal": "#60a5fa", // Sky blue (sky-400) - visible on dark background
  };

  const signalColorPalette = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
    "#a855f7", "#0ea5e9", "#14b8a6", "#d946ef", "#f43f5e", "#38bdf8",
  ];

  const signalColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let paletteIndex = 0;
    
    sortedSignalDistribution.forEach((item) => {
      const normalizedSignal = item.signal.trim();
      const upperSignal = normalizedSignal.toUpperCase();
      
      // Check for fixed colors first (case-insensitive)
      if (fixedSignalColors[normalizedSignal]) {
        map.set(item.signal, fixedSignalColors[normalizedSignal]);
      } else if (fixedSignalColors[upperSignal]) {
        map.set(item.signal, fixedSignalColors[upperSignal]);
      } else if (upperSignal === "BUY") {
        map.set(item.signal, fixedSignalColors["BUY"]);
      } else if (upperSignal === "SELL") {
        map.set(item.signal, fixedSignalColors["SELL"]);
      } else if (upperSignal === "HOLD") {
        map.set(item.signal, fixedSignalColors["HOLD"]);
      } else if (upperSignal.includes("SELL") && !upperSignal.includes("BUY")) {
        map.set(item.signal, fixedSignalColors["SELL"]);
      } else if (upperSignal.includes("BUY") && !upperSignal.includes("SELL")) {
        map.set(item.signal, fixedSignalColors["BUY"]);
      } else {
        // Use palette for other signals
        map.set(item.signal, signalColorPalette[paletteIndex % signalColorPalette.length]);
        paletteIndex++;
      }
    });
    return map;
  }, [sortedSignalDistribution]);

  const formatLabel = (label: string, max = 14) =>
    label.length > max ? `${label.slice(0, max)}…` : label;

  const signalPieData = sortedSignalDistribution.map((item) => ({
    name: item.signal,
    value: item.count,
    color: signalColorMap.get(item.signal) || signalColorPalette[0],
  })).filter(item => item.value > 0);

  const signalBarData = sortedSignalDistribution.map((item) => ({
    signal: item.signal,
    count: item.count,
    color: signalColorMap.get(item.signal) || signalColorPalette[0],
  }));

  const signalChartConfig = useMemo(() => {
    const entries = signalPieData.map((item) => [item.name, { label: item.name, color: item.color }]);
    return Object.fromEntries(entries);
  }, [signalPieData]);

  const resolvedSignalChartConfig = useMemo(() => {
    if (Object.keys(signalChartConfig).length > 0) return signalChartConfig;
    return { Signals: { label: "Signals", color: "hsl(var(--primary))" } };
  }, [signalChartConfig]);

  const signalFilterOptions = useMemo(() => {
    const opts = new Set<string>([
      "BUY",
      "SELL",
      "HOLD",
      "Check_OPM (Sell)",
      "No Signal",
    ]);
    sortedSignalDistribution.forEach((item) => opts.add(item.signal));
    return Array.from(opts).sort((a, b) => a.localeCompare(b));
  }, [sortedSignalDistribution]);

  // Quick sanity check: distribution total should match signals length
  useEffect(() => {
    if (allSignals && sortedSignalDistribution.length > 0) {
      const distTotal = sortedSignalDistribution.reduce((sum, item) => sum + item.count, 0);
      if (distTotal !== allSignals.length) {
        console.warn(`Signal distribution mismatch: distribution=${distTotal}, signals=${allSignals.length}`);
      }
    }
  }, [allSignals, sortedSignalDistribution]);

  // Top sectors by company count
  const topSectorsData = useMemo(() => {
    return sectorOverview
      .sort((a, b) => b.companies - a.companies)
      .slice(0, 10)
      .map(sector => ({
        id: sector.id,
        name: sector.name.length > 15 ? sector.name.substring(0, 15) + "..." : sector.name,
        fullName: sector.name,
        companies: sector.companies,
        buy: sector.buySignals,
        sell: sector.sellSignals,
        hold: sector.holdSignals,
      }));
  }, [sectorOverview]);

  // Sector signal distribution (stacked bar)
  const sectorSignalData = useMemo(() => {
    return sectorOverview
      .sort((a, b) => (b.buySignals + b.sellSignals + b.holdSignals) - (a.buySignals + a.sellSignals + a.holdSignals))
      .slice(0, 8)
      .map(sector => ({
        name: sector.name.length > 12 ? sector.name.substring(0, 12) + "..." : sector.name,
        fullName: sector.name,
        BUY: sector.buySignals,
        SELL: sector.sellSignals,
        HOLD: sector.holdSignals,
      }));
  }, [sectorOverview]);

  // Helper functions for financial data formatting
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

  const getFinancialValueNumber = (company: Company, key: string): number | null => {
    if (!company.financialData) return null;
    const data = company.financialData as any;
    const value = data[key];
    if (value === undefined || value === null) return null;
    const numValue = parseFloat(value);
    return isNaN(numValue) ? null : numValue;
  };

  // Get latest signal for each company
  const companiesWithSignals = useMemo(() => {
    if (!companies || !allSignals) return [];

    // Create a map of company ID to latest signal
    const signalsByCompany = new Map<string, Signal>();
    allSignals.forEach(signal => {
      const existing = signalsByCompany.get(signal.companyId);
      if (!existing || new Date(signal.createdAt) > new Date(existing.createdAt)) {
        signalsByCompany.set(signal.companyId, signal);
      }
    });

    return companies.map(company => ({
      ...company,
      latestSignal: signalsByCompany.get(company.id)?.signal as string | undefined,
      signalId: signalsByCompany.get(company.id)?.id,
    }));
  }, [companies, allSignals]);

  // Filter companies based on search and filters
  const filteredCompanies = useMemo(() => {
    if (!companiesWithSignals) return [];

    let filtered = companiesWithSignals;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(company =>
        company.ticker.toLowerCase().includes(term) ||
        company.name?.toLowerCase().includes(term)
      );
    }

    // Signal filter
    if (signalFilter !== "all") {
      filtered = filtered.filter(company => company.latestSignal === signalFilter);
    }

    // Market Cap filter
    // Note: marketCap is stored in rupees, but user input is in crores, so we convert input to rupees
    if (marketCapMin.trim() || marketCapMax.trim()) {
      filtered = filtered.filter(company => {
        const marketCap = company.marketCap ? parseFloat(String(company.marketCap)) : null;
        if (marketCap === null || isNaN(marketCap) || !isFinite(marketCap)) return false;
        
        const minStr = marketCapMin.trim();
        const maxStr = marketCapMax.trim();
        const minCrores = minStr ? parseFloat(minStr) : null;
        const maxCrores = maxStr ? parseFloat(maxStr) : null;
        
        // Validate parsed values
        if (minCrores !== null && (isNaN(minCrores) || !isFinite(minCrores))) return false;
        if (maxCrores !== null && (isNaN(maxCrores) || !isFinite(maxCrores))) return false;
        
        // Convert user input from crores to rupees (multiply by 10000000)
        const min = minCrores !== null ? minCrores * 10000000 : null;
        const max = maxCrores !== null ? maxCrores * 10000000 : null;
        
        // Apply filters: exclude if value is below min or above max
        if (min !== null && marketCap < min) return false;
        if (max !== null && marketCap > max) return false;
        return true;
      });
    }

    // ROE filter
    if (roeMin.trim() || roeMax.trim()) {
      filtered = filtered.filter(company => {
        const roe = getFinancialValueNumber(company, "roe");
        if (roe === null || isNaN(roe) || !isFinite(roe)) return false;
        
        const minStr = roeMin.trim();
        const maxStr = roeMax.trim();
        const min = minStr ? parseFloat(minStr) : null;
        const max = maxStr ? parseFloat(maxStr) : null;
        
        // Validate parsed values
        if (min !== null && (isNaN(min) || !isFinite(min))) return false;
        if (max !== null && (isNaN(max) || !isFinite(max))) return false;
        
        // Apply filters: exclude if value is below min or above max
        if (min !== null && roe < min) return false;
        if (max !== null && roe > max) return false;
        return true;
      });
    }

    // P/E filter
    if (peMin.trim() || peMax.trim()) {
      filtered = filtered.filter(company => {
        const pe = getFinancialValueNumber(company, "pe");
        if (pe === null || isNaN(pe) || !isFinite(pe)) return false;
        
        const minStr = peMin.trim();
        const maxStr = peMax.trim();
        const min = minStr ? parseFloat(minStr) : null;
        const max = maxStr ? parseFloat(maxStr) : null;
        
        // Validate parsed values
        if (min !== null && (isNaN(min) || !isFinite(min))) return false;
        if (max !== null && (isNaN(max) || !isFinite(max))) return false;
        
        // Apply filters: exclude if value is below min or above max
        if (min !== null && pe < min) return false;
        if (max !== null && pe > max) return false;
        return true;
      });
    }

    // Revenue filter
    // Note: revenue is stored in rupees, but user input is in crores, so we convert input to rupees
    if (revenueMin.trim() || revenueMax.trim()) {
      filtered = filtered.filter(company => {
        const revenue = getFinancialValueNumber(company, "revenue");
        if (revenue === null || isNaN(revenue) || !isFinite(revenue)) return false;
        
        const minStr = revenueMin.trim();
        const maxStr = revenueMax.trim();
        const minCrores = minStr ? parseFloat(minStr) : null;
        const maxCrores = maxStr ? parseFloat(maxStr) : null;
        
        // Validate parsed values
        if (minCrores !== null && (isNaN(minCrores) || !isFinite(minCrores))) return false;
        if (maxCrores !== null && (isNaN(maxCrores) || !isFinite(maxCrores))) return false;
        
        // Convert user input from crores to rupees (multiply by 10000000)
        const min = minCrores !== null ? minCrores * 10000000 : null;
        const max = maxCrores !== null ? maxCrores * 10000000 : null;
        
        // Apply filters: exclude if value is below min or above max
        if (min !== null && revenue < min) return false;
        if (max !== null && revenue > max) return false;
        return true;
      });
    }

    return filtered;
  }, [companiesWithSignals, searchTerm, signalFilter, marketCapMin, marketCapMax, roeMin, roeMax, peMin, peMax, revenueMin, revenueMax]);

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
        case "marketCap":
          aValue = a.marketCap ? parseFloat(String(a.marketCap)) : 0;
          bValue = b.marketCap ? parseFloat(String(b.marketCap)) : 0;
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
        case "signal":
          aValue = a.latestSignal || "";
          bValue = b.latestSignal || "";
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

  // Handle chart click to filter by signal
  const handleChartClick = (signal: string) => {
    // If clicking the same signal, reset to "all", otherwise set to the clicked signal
    if (signalFilter === signal) {
      setSignalFilter("all");
    } else {
      setSignalFilter(signal);
    }
    setCurrentPage(1); // Reset to first page when filter changes
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, signalFilter, marketCapMin, marketCapMax, roeMin, roeMax, peMin, peMax, revenueMin, revenueMax, metricFilters, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Dashboard
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Real-time overview of your financial screening data</p>
          </div>
          <div className="flex items-center gap-2">
            {signalStatus && (
              <div className="flex items-center gap-2 text-sm">
                {signalStatus.staleSignals > 0 ? (
                  <div className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                    <AlertCircle className="h-4 w-4" />
                    <span>{signalStatus.staleSignals} stale</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Up to date</span>
                  </div>
                )}
                {signalStatus.lastCalculationTime && (
                  <span className="text-muted-foreground">
                    • {formatDistanceToNow(new Date(signalStatus.lastCalculationTime), { addSuffix: true })}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRefreshSignals(true)}
              disabled={isRefreshing || signalStatus?.queue.isProcessing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing || signalStatus?.queue.isProcessing ? 'animate-spin' : ''}`} />
              Refresh Signals
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold" data-testid="text-total-companies">{stats.totalCompanies}</div>
            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">Across all sectors</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Active Signals</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold" data-testid="text-active-signals">{stats.activeSignals}</div>
            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">BUY or SELL signals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Sectors</CardTitle>
            <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold" data-testid="text-sectors">{stats.sectors}</div>
            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">Industry classifications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Last Update</CardTitle>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-lg sm:text-2xl font-bold" data-testid="text-last-update">{stats.lastUpdate}</div>
            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">Data refresh time</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 w-full min-w-0">
        {/* Signal Distribution Pie Chart */}
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Signal Distribution</CardTitle>
            <CardDescription>Overall signal breakdown - Click a segment to filter</CardDescription>
          </CardHeader>
          <CardContent className="w-full min-w-0">
            {signalPieData.length > 0 ? (
              <ChartContainer
                config={resolvedSignalChartConfig}
                className="h-[300px] w-full min-w-0"
              >
                <PieChart>
                  <Pie
                    data={signalPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${formatLabel(name)} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    onClick={(data: any) => {
                      if (data && data.name) {
                        handleChartClick(data.name);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {signalPieData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        style={{ 
                          cursor: "pointer",
                          opacity: signalFilter === entry.name || signalFilter === "all" ? 1 : 0.5,
                          transition: "opacity 0.2s"
                        }}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No signal data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signal Count Bar Chart */}
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Signal Count</CardTitle>
            <CardDescription>Number of companies by signal type - Click a bar to filter</CardDescription>
          </CardHeader>
          <CardContent className="w-full min-w-0">
            <ChartContainer
              config={{
                count: { label: "Companies", color: "hsl(var(--primary))" },
              }}
              className="h-[300px] w-full min-w-0"
            >
              <BarChart 
                data={signalBarData}
                onClick={(data: any) => {
                  if (data && data.activePayload && data.activePayload[0]) {
                    const signal = data.activePayload[0].payload.signal;
                    handleChartClick(signal);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="signal" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar 
                  dataKey="count" 
                  fill="hsl(var(--primary))"
                  radius={[8, 8, 0, 0]}
                  style={{ cursor: "pointer" }}
                >
                  {signalBarData.map((entry, index) => (
                    <Cell
                      key={`bar-cell-${index}`}
                      fill={entry.color}
                      style={{ 
                        cursor: "pointer",
                        transition: "fill 0.2s",
                        opacity: signalFilter === entry.signal || signalFilter === "all" ? 1 : 0.4
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top Sectors by Companies */}
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Top Sectors</CardTitle>
            <CardDescription>Largest sectors by company count - Click a bar to view sector</CardDescription>
          </CardHeader>
          <CardContent className="w-full min-w-0">
            {topSectorsData.length > 0 ? (
              <ChartContainer
                config={{
                  companies: { label: "Companies", color: "hsl(217, 91%, 60%)" },
                }}
                className="h-[300px] w-full min-w-0"
              >
                <BarChart 
                  data={topSectorsData} 
                  layout="vertical" 
                  margin={{ left: 5, right: 5, top: 5, bottom: 5 }}
                  onClick={(data: any) => {
                    if (data && data.activePayload && data.activePayload[0]) {
                      const sectorId = data.activePayload[0].payload.id;
                      if (sectorId) {
                        setLocation(`/sectors/${sectorId}`);
                      }
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: any, name: string) => [value, "Companies"]}
                  />
                  <Bar 
                    dataKey="companies" 
                    fill="hsl(217, 91%, 60%)" 
                    radius={[0, 8, 8, 0]}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(data: any, index: number, e: any) => {
                      if (e && e.target) {
                        e.target.style.opacity = "0.8";
                      }
                    }}
                    onMouseLeave={(data: any, index: number, e: any) => {
                      if (e && e.target) {
                        e.target.style.opacity = "1";
                      }
                    }}
                  >
                    {topSectorsData.map((entry, index) => (
                      <Cell
                        key={`sector-bar-${index}`}
                        fill="hsl(217, 91%, 60%)"
                        style={{ 
                          cursor: "pointer",
                          transition: "opacity 0.2s"
                        }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No sector data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sector Signal Distribution */}
      <Card className="w-full min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Sector Signal Distribution</CardTitle>
          <CardDescription>Signal breakdown across top sectors</CardDescription>
        </CardHeader>
        <CardContent className="w-full min-w-0 overflow-x-auto">
          {sectorSignalData.length > 0 ? (
            <div className="w-full min-w-[600px]">
              <ChartContainer
                config={{
                  BUY: { label: "BUY", color: "hsl(142, 76%, 36%)" },
                  SELL: { label: "SELL", color: "hsl(0, 84%, 60%)" },
                  HOLD: { label: "HOLD", color: "hsl(38, 92%, 50%)" },
                }}
                className="h-[400px] w-full"
              >
                <BarChart data={sectorSignalData} margin={{ left: 10, right: 10, top: 10, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="BUY" stackId="a" fill="hsl(142, 76%, 36%)" />
                  <Bar dataKey="SELL" stackId="a" fill="hsl(0, 84%, 60%)" />
                  <Bar dataKey="HOLD" stackId="a" fill="hsl(38, 92%, 50%)" />
                </BarChart>
              </ChartContainer>
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No sector signal data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Companies List Section with Search, Filters, and View Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>Companies List</CardTitle>
              <CardDescription>View and filter all companies with their trading signals</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4 mr-2" />
                List
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Grid3x3 className="h-4 w-4 mr-2" />
                Grid
              </Button>
            </div>
          </div>

          {/* Search and Quick Filters */}
          <div className="mt-4 space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ticker or company name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="signal-filter" className="text-sm whitespace-nowrap">Signal:</Label>
                <Select value={signalFilter} onValueChange={setSignalFilter}>
                  <SelectTrigger id="signal-filter" className="w-full sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Signals</SelectItem>
                    {signalFilterOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Advanced Filters - Collapsible */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <Filter className="h-4 w-4 mr-2" />
                  Advanced Filters
                  <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/30">
                  {/* Market Cap Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="market-cap-min" className="text-sm font-medium">Market Cap (Cr)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="market-cap-min"
                        type="number"
                        placeholder="Min"
                        value={marketCapMin}
                        onChange={(e) => setMarketCapMin(e.target.value)}
                        className="w-full"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        id="market-cap-max"
                        type="number"
                        placeholder="Max"
                        value={marketCapMax}
                        onChange={(e) => setMarketCapMax(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* ROE Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="roe-min" className="text-sm font-medium">ROE (%)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="roe-min"
                        type="number"
                        placeholder="Min"
                        value={roeMin}
                        onChange={(e) => setRoeMin(e.target.value)}
                        className="w-full"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        id="roe-max"
                        type="number"
                        placeholder="Max"
                        value={roeMax}
                        onChange={(e) => setRoeMax(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* P/E Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="pe-min" className="text-sm font-medium">P/E Ratio</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="pe-min"
                        type="number"
                        placeholder="Min"
                        value={peMin}
                        onChange={(e) => setPeMin(e.target.value)}
                        className="w-full"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        id="pe-max"
                        type="number"
                        placeholder="Max"
                        value={peMax}
                        onChange={(e) => setPeMax(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Revenue Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="revenue-min" className="text-sm font-medium">Revenue (Cr)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="revenue-min"
                        type="number"
                        placeholder="Min"
                        value={revenueMin}
                        onChange={(e) => setRevenueMin(e.target.value)}
                        className="w-full"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        id="revenue-max"
                        type="number"
                        placeholder="Max"
                        value={revenueMax}
                        onChange={(e) => setRevenueMax(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
                {/* Dynamic Metric Filters */}
                <div className="p-4 border rounded-lg bg-muted/30">
                  <MetricFilter filters={metricFilters} onFiltersChange={setMetricFilters} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCompanies.length > 0 ? (
            <>
              {viewMode === "list" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                          onClick={() => handleSort("marketCap")}
                        >
                          <div className="flex items-center justify-end">
                            Market Cap
                            <SortIcon field="marketCap" />
                          </div>
                        </TableHead>
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
                          className="text-center cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("signal")}
                        >
                          <div className="flex items-center justify-center">
                            Signal
                            <SortIcon field="signal" />
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-mono font-bold">
                          <Link href={`/company/id/${company.id}`}>
                            <button className="hover:text-primary transition-colors flex items-center gap-1">
                              {company.ticker}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </Link>
                        </TableCell>
                        <TableCell>{company.name}</TableCell>
                        <TableCell className="text-muted-foreground">{getSectorName(company.sectorId)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {company.marketCap ? `₹${(parseFloat(String(company.marketCap)) / 10000000).toFixed(2)} Cr` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{getFinancialValue(company, "revenue")}</TableCell>
                        <TableCell className="text-right font-mono">{getFinancialValue(company, "roe")}</TableCell>
                        <TableCell className="text-right font-mono">{getFinancialValue(company, "pe")}</TableCell>
                        <TableCell className="text-center">
                          {company.latestSignal ? (
                            <SignalBadge signal={company.latestSignal} />
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(company.updatedAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedCompanies.map((company) => (
                  <Link key={company.id} href={`/company/id/${company.id}`}>
                    <div className="group p-3 sm:p-4 rounded-lg border hover-elevate cursor-pointer h-full">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-bold text-base sm:text-lg">{company.ticker}</div>
                          <div className="text-sm text-muted-foreground truncate">{company.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">{getSectorName(company.sectorId)}</div>
                        </div>
                        {company.latestSignal && (
                          <SignalBadge signal={company.latestSignal} />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Market Cap:</span>
                          <div className="font-mono font-semibold truncate">
                            {company.marketCap ? `₹${(parseFloat(String(company.marketCap)) / 10000000).toFixed(2)} Cr` : "—"}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Revenue:</span>
                          <div className="font-mono font-semibold truncate">{getFinancialValue(company, "revenue")}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ROE:</span>
                          <div className="font-mono font-semibold">{getFinancialValue(company, "roe")}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">P/E:</span>
                          <div className="font-mono font-semibold">{getFinancialValue(company, "pe")}</div>
                        </div>
                      </div>
                    </div>
                    </Link>
                  ))}
                </div>
              )}
              
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
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No companies match your filters. Try adjusting the search or filter criteria.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sectors Overview and Recent Signals - Moved to End */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sectors Overview</CardTitle>
            <CardDescription>Signal distribution by industry sector</CardDescription>
          </CardHeader>
          <CardContent>
            {sectorOverview.length > 0 ? (
              <div className="space-y-3">
                {sectorOverview.map((sector) => (
                  <Link key={sector.id} href={`/sectors/${sector.id}`}>
                    <div className="group p-4 rounded-lg border hover-elevate cursor-pointer" data-testid={`card-sector-${sector.id}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-lg">{sector.name}</h4>
                        <span className="text-sm text-muted-foreground">{sector.companies} companies</span>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex items-center gap-1.5">
                          <SignalBadge signal="BUY" showIcon={false} />
                          <span className="text-sm font-medium text-muted-foreground">{sector.buySignals}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <SignalBadge signal="SELL" showIcon={false} />
                          <span className="text-sm font-medium text-muted-foreground">{sector.sellSignals}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <SignalBadge signal="HOLD" showIcon={false} />
                          <span className="text-sm font-medium text-muted-foreground">{sector.holdSignals}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No sectors available. Add sectors to get started.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest generated trading signals</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSignals.length > 0 ? (
              <div className="space-y-3">
                {recentSignals.map((item, index) => (
                  <Link key={index} href={`/company/${item.ticker}`}>
                    <div className="group p-4 rounded-lg border hover-elevate cursor-pointer" data-testid={`signal-${item.ticker.toLowerCase()}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-mono font-bold text-lg">{item.ticker}</div>
                          <div className="text-sm text-muted-foreground">{item.company}</div>
                        </div>
                        <SignalBadge signal={item.signal} />
                      </div>
                      {item.metadata && typeof item.metadata === 'object' && 'condition' in (item.metadata as any) && (
                        <div className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded truncate">
                          {String((item.metadata as any).condition)}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No signals yet. Run signal calculation to get started.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
