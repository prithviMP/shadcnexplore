import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Search, ArrowLeft, TrendingUp, Play, Loader2, Filter, RefreshCw, Calculator, CheckCircle2, CheckSquare, Square, XCircle, Plus, Trash2, Settings, List, Grid3x3, Building2, ChevronDown } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Company, Sector, Formula, SectorMapping } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { sortQuarterStrings, formatQuarterWithLabel } from "@/utils/quarterUtils";
import SignalBadge from "@/components/SignalBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import QuarterlyDataSpreadsheet from "@/components/QuarterlyDataSpreadsheet";

interface QuarterlyDataResponse {
  sectorId: string;
  quarters: string[];
  metrics: string[];
  companies: Array<{
    ticker: string;
    companyId: string | null;
    companyName: string;
    quarters: Record<string, Record<string, string | null>>;
  }>;
  raw: any[];
}

interface CompanySignal {
  ticker: string;
  companyId: string;
  signal: string | null;
  summary: {
    total: number;
    buy: number;
    sell: number;
    hold: number;
  };
}

export default function SectorsList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMetric, setSelectedMetric] = useState<string>("all");
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [bulkScrapeOpen, setBulkScrapeOpen] = useState(false);
  const [scrapingSectorId, setScrapingSectorId] = useState<string | null>(null);
  const [marketCapMin, setMarketCapMin] = useState<string>("");
  const [marketCapMax, setMarketCapMax] = useState<string>("");
  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [scrapingTickers, setScrapingTickers] = useState<Set<string>>(new Set());
  const [selectedMetricsForTable, setSelectedMetricsForTable] = useState<string[]>([]);
  const [selectedQuartersForTable, setSelectedQuartersForTable] = useState<string[]>([]);
  const [quarterlySearchTerm, setQuarterlySearchTerm] = useState("");

  // Formula Evaluation State
  const [selectedQuartersForFormula, setSelectedQuartersForFormula] = useState<Set<string>>(new Set());
  const [showFormulaBar, setShowFormulaBar] = useState(false);
  const [customFormula, setCustomFormula] = useState<string>("");
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>("");
  const [useCustomFormula, setUseCustomFormula] = useState(false);
  const [customFormulaSignal, setCustomFormulaSignal] = useState<string>("BUY");
  const [formulaResults, setFormulaResults] = useState<Record<string, { result: string | number | boolean, type: string }>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Sector list view state
  const [sectorSearchTerm, setSectorSearchTerm] = useState("");
  const [sectorViewMode, setSectorViewMode] = useState<"list" | "grid">("grid");
  const [sectorSignalFilter, setSectorSignalFilter] = useState<string>("all");
  const [sectorCompanyCountMin, setSectorCompanyCountMin] = useState<string>("");
  const [sectorCompanyCountMax, setSectorCompanyCountMax] = useState<string>("");
  const [sectorFiltersOpen, setSectorFiltersOpen] = useState(false);

  // Sector Management State
  const [createSectorOpen, setCreateSectorOpen] = useState(false);
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorDescription, setNewSectorDescription] = useState("");
  const [manageMappingsOpen, setManageMappingsOpen] = useState(false);
  const [newMappingName, setNewMappingName] = useState("");

  const itemsPerPage = 10;
  const [, params] = useRoute("/sectors/:sectorId");
  const routeSectorId = params?.sectorId;

  const isAdmin = user?.role === "admin";

  const { data: sectors, isLoading: sectorsLoading } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  // Fetch all companies for sector stats
  const { data: allCompanies } = useQuery<Company[]>({
    queryKey: ["/api/companies"]
  });

  // Fetch all signals for sector stats
  const { data: allSignals } = useQuery<any[]>({
    queryKey: ["/api/signals"]
  });

  const { data: formulas } = useQuery<Formula[]>({
    queryKey: ["/api/formulas"],
  });

  // Get global formula as fallback
  const globalFormula = useMemo(() => {
    if (!formulas) return null;
    const globalFormulas = formulas
      .filter(f => f.enabled && f.scope === "global")
      .sort((a, b) => a.priority - b.priority);
    return globalFormulas[0] || null;
  }, [formulas]);

  // If route has sectorId, use it; otherwise check if it's a sector name and find the ID
  const resolvedSectorId = routeSectorId
    ? (sectors?.find(s => s.id === routeSectorId || s.name.toLowerCase() === routeSectorId.toLowerCase())?.id || routeSectorId)
    : selectedSectorId;

  // Determine which sector to show
  const displaySectorId = resolvedSectorId || null;

  // Fetch sector-specific formula (moved after displaySectorId is defined)
  const { data: sectorFormulaData } = useQuery<{ formula: Formula | null }>({
    queryKey: ["/api/v1/formulas/entity", "sector", displaySectorId],
    queryFn: async () => {
      if (!displaySectorId) return { formula: null };
      const res = await apiRequest("GET", `/api/v1/formulas/entity/sector/${displaySectorId}`);
      return res.json();
    },
    enabled: !!displaySectorId
  });

  // Get active formula for sector: sector-specific > global
  const activeSectorFormula = useMemo(() => {
    return sectorFormulaData?.formula || globalFormula;
  }, [sectorFormulaData, globalFormula]);
  const currentSector = sectors?.find(s => s.id === displaySectorId);

  // Fetch quarterly data for the selected sector
  const { data: quarterlyData, isLoading: quarterlyLoading } = useQuery<QuarterlyDataResponse>({
    queryKey: ["/api/v1/sectors", displaySectorId, "quarterly-data"],
    queryFn: async () => {
      if (!displaySectorId) throw new Error("No sector selected");
      const res = await apiRequest("GET", `/api/v1/sectors/${displaySectorId}/quarterly-data`);
      return res.json();
    },
    enabled: !!displaySectorId,
  });

  // Sort quarterly data chronologically (oldest to newest)
  const sortedQuarterlyData = useMemo(() => {
    if (!quarterlyData) return null;
    return {
      ...quarterlyData,
      quarters: sortQuarterStrings(quarterlyData.quarters)
    };
  }, [quarterlyData]);

  // Fetch companies for the selected sector
  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies", { sectorId: displaySectorId }],
    enabled: !!displaySectorId,
  });

  // Fetch signals for all companies in the sector
  const { data: companySignalsMap, isLoading: signalsLoading } = useQuery<Record<string, CompanySignal>>({
    queryKey: ["/api/v1/sectors", displaySectorId, "company-signals"],
    queryFn: async () => {
      if (!displaySectorId || !companies || companies.length === 0) return {};

      // Fetch signals for all companies in parallel
      const signalPromises = companies.map(async (company) => {
        try {
          const res = await apiRequest("GET", `/api/v1/companies/${company.ticker}/signals`);
          const data = await res.json();

          // Determine primary signal (BUY > SELL > HOLD priority)
          let primarySignal: string | null = null;
          if (data.summary.buy > 0) {
            primarySignal = "BUY";
          } else if (data.summary.sell > 0) {
            primarySignal = "SELL";
          } else if (data.summary.hold > 0) {
            primarySignal = "HOLD";
          }

          return {
            ticker: company.ticker,
            companyId: data.companyId,
            signal: primarySignal,
            summary: data.summary,
          };
        } catch (error) {
          // If signal fetch fails, return null signal
          return {
            ticker: company.ticker,
            companyId: company.id,
            signal: null,
            summary: { total: 0, buy: 0, sell: 0, hold: 0 },
          };
        }
      });

      const signals = await Promise.all(signalPromises);
      return signals.reduce((acc, signal) => {
        acc[signal.ticker] = signal;
        return acc;
      }, {} as Record<string, CompanySignal>);
    },
    enabled: !!displaySectorId && !!companies && companies.length > 0,
  });

  // Fetch sector mappings
  const { data: sectorMappings, isLoading: mappingsLoading } = useQuery<SectorMapping[]>({
    queryKey: ["/api/v1/sector-mappings", displaySectorId],
    enabled: !!displaySectorId && manageMappingsOpen,
  });

  // Create Sector Mutation
  const createSectorMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/sectors", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Sector created",
        description: "New sector has been created successfully."
      });
      setCreateSectorOpen(false);
      setNewSectorName("");
      setNewSectorDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create sector",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Create Mapping Mutation
  const createMappingMutation = useMutation({
    mutationFn: async (data: { sectorId: string; screenerSector: string }) => {
      const res = await apiRequest("POST", "/api/v1/sector-mappings", {
        customSectorId: data.sectorId,
        screenerSector: data.screenerSector
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Mapping added",
        description: "Sector mapping has been added successfully."
      });
      setNewMappingName("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sector-mappings", displaySectorId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add mapping",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete Mapping Mutation
  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/sector-mappings/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Mapping removed",
        description: "Sector mapping has been removed successfully."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sector-mappings", displaySectorId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove mapping",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleCreateSector = () => {
    if (!newSectorName) return;
    createSectorMutation.mutate({
      name: newSectorName,
      description: newSectorDescription
    });
  };

  const handleAddMapping = () => {
    if (!displaySectorId || !newMappingName) return;
    createMappingMutation.mutate({
      sectorId: displaySectorId,
      screenerSector: newMappingName
    });
  };

  const handleDeleteMapping = (id: string) => {
    deleteMappingMutation.mutate(id);
  };

  // Filter companies based on search and signal filter
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];

    return companies.filter(company => {
      const matchesSearch = company.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        company.name.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Filter by signal
      if (signalFilter !== "all") {
        const signal = companySignalsMap?.[company.ticker]?.signal;
        if (signalFilter === "none" && signal !== null) return false;
        if (signalFilter !== "none" && signal !== signalFilter) return false;
      }

      return true;
    });
  }, [companies, searchTerm, signalFilter, companySignalsMap]);

  // Pagination
  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const paginatedCompanies = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCompanies.slice(startIndex, endIndex);
  }, [filteredCompanies, currentPage, itemsPerPage]);

  // Calculate signal distribution for charts
  const signalDistribution = useMemo(() => {
    if (!companySignalsMap || !companies) return { buy: 0, sell: 0, hold: 0, none: 0 };

    const distribution = { buy: 0, sell: 0, hold: 0, none: 0 };

    companies.forEach(company => {
      const signal = companySignalsMap[company.ticker]?.signal;
      if (signal === "BUY") distribution.buy++;
      else if (signal === "SELL") distribution.sell++;
      else if (signal === "HOLD") distribution.hold++;
      else distribution.none++;
    });

    return distribution;
  }, [companySignalsMap, companies]);

  // Chart data
  const pieChartData = [
    { name: "BUY", value: signalDistribution.buy, color: "hsl(var(--chart-1))" },
    { name: "SELL", value: signalDistribution.sell, color: "hsl(var(--chart-2))" },
    { name: "HOLD", value: signalDistribution.hold, color: "hsl(var(--chart-3))" },
    { name: "No Signal", value: signalDistribution.none, color: "hsl(var(--muted))" },
  ].filter(item => item.value > 0);

  const barChartData = [
    { signal: "BUY", count: signalDistribution.buy },
    { signal: "SELL", count: signalDistribution.sell },
    { signal: "HOLD", count: signalDistribution.hold },
    { signal: "No Signal", count: signalDistribution.none },
  ];

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, signalFilter]);

  // Fetch default metrics from settings
  const { data: defaultMetricsData } = useQuery<{
    metrics: Record<string, boolean>;
    visibleMetrics: string[];
  }>({
    queryKey: ["/api/settings/default-metrics"],
    retry: 1, // Retry once if it fails
  });

  // Initialize formula from active sector formula when sector changes
  useEffect(() => {
    if (activeSectorFormula && !customFormula && !selectedFormulaId) {
      setCustomFormula(activeSectorFormula.condition);
      setCustomFormulaSignal(activeSectorFormula.signal);
      setUseCustomFormula(false);
    }
  }, [activeSectorFormula, displaySectorId]);

  // Initialize selected metrics and quarters when data loads
  useEffect(() => {
    if (sortedQuarterlyData && selectedMetricsForTable.length === 0) {
      // Use default metrics from API if available
      let defaultMetricNames: string[] = [];
      
      if (defaultMetricsData?.visibleMetrics && defaultMetricsData.visibleMetrics.length > 0) {
        // Use metrics from settings API
        defaultMetricNames = defaultMetricsData.visibleMetrics;
      } else {
        // Fallback to hardcoded defaults if API fails
        defaultMetricNames = [
          'Sales',
          'Sales Growth(YoY) %',
          'Sales Growth(QoQ) %',
          'EPS in Rs',
          'EPS Growth(YoY) %',
          'EPS Growth(QoQ) %',
        ];
      }

      // Find metrics that match default names exactly
      const matchedMetrics = defaultMetricNames.filter(metricName =>
        sortedQuarterlyData.metrics.includes(metricName)
      );

      if (matchedMetrics.length > 0) {
        setSelectedMetricsForTable(matchedMetrics);
      } else if (sortedQuarterlyData.metrics.length > 0) {
        // If default metrics not found, use first 6 metrics
        setSelectedMetricsForTable(sortedQuarterlyData.metrics.slice(0, 6));
      }

      // Default to show last 12 quarters (or all if less than 12)
      if (selectedQuartersForTable.length === 0 && sortedQuarterlyData.quarters.length > 0) {
        const quartersToShow = sortedQuarterlyData.quarters.length > 12
          ? sortedQuarterlyData.quarters.slice(-12)
          : sortedQuarterlyData.quarters;
        setSelectedQuartersForTable(quartersToShow);
      }
    }
  }, [sortedQuarterlyData, selectedMetricsForTable.length, selectedQuartersForTable.length, defaultMetricsData]);

  // Auto-select last 12 quarters for formula evaluation when data loads
  useEffect(() => {
    if (sortedQuarterlyData && sortedQuarterlyData.quarters.length > 0 && selectedQuartersForFormula.size === 0) {
      const quartersForFormula = sortedQuarterlyData.quarters.length > 12
        ? sortedQuarterlyData.quarters.slice(-12)
        : sortedQuarterlyData.quarters;
      setSelectedQuartersForFormula(new Set(quartersForFormula));
    }
  }, [sortedQuarterlyData, selectedQuartersForFormula.size]);

  // Filter companies for quarterly table
  const filteredCompaniesForQuarterly = useMemo(() => {
    if (!companies) return [];
    return companies.filter(company => {
      const matchesSearch = company.ticker.toLowerCase().includes(quarterlySearchTerm.toLowerCase()) ||
        company.name.toLowerCase().includes(quarterlySearchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [companies, quarterlySearchTerm]);

  const bulkScrapeMutation = useMutation({
    mutationFn: async (data: { sectorId: string; conditions?: { marketCapMin?: number; marketCapMax?: number } }) => {
      const res = await apiRequest("POST", "/api/v1/scraper/scrape/sector", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Scraping started",
        description: `Scraping ${data.total} companies in sector. This may take a while.`
      });
      setBulkScrapeOpen(false);
      setMarketCapMin("");
      setMarketCapMax("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sectors"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start scraping",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation for refreshing/scraping a single company
  const refreshCompanyMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("POST", "/api/v1/scraper/scrape/single", { ticker });
      return res.json();
    },
    onSuccess: (data, ticker) => {
      toast({
        title: "Data refreshed",
        description: `Successfully scraped data for ${ticker}`
      });
      setScrapingTickers(prev => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", ticker, "data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", ticker, "signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sectors", displaySectorId, "quarterly-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sectors", displaySectorId, "company-signals"] });
    },
    onError: (error: Error, ticker) => {
      toast({
        title: "Failed to refresh data",
        description: error.message,
        variant: "destructive"
      });
      setScrapingTickers(prev => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    },
    onMutate: (ticker) => {
      setScrapingTickers(prev => new Set(prev).add(ticker));
    }
  });

  const handleRefreshCompany = (ticker: string) => {
    refreshCompanyMutation.mutate(ticker);
  };

  const handleBulkScrape = () => {
    if (!scrapingSectorId) return;

    const conditions: { marketCapMin?: number; marketCapMax?: number } = {};
    if (marketCapMin) {
      const min = parseFloat(marketCapMin);
      if (!isNaN(min)) conditions.marketCapMin = min;
    }
    if (marketCapMax) {
      const max = parseFloat(marketCapMax);
      if (!isNaN(max)) conditions.marketCapMax = max;
    }

    bulkScrapeMutation.mutate({
      sectorId: scrapingSectorId,
      conditions: Object.keys(conditions).length > 0 ? conditions : undefined,
    });
  };

  const formatValue = (value: string | null, metricName: string): string => {
    if (value === null || value === undefined) return "—";
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value || "—";

    // Format based on metric type - matching Python code format
    // Percentages: Sales Growth(YoY) %, EPS Growth(YoY) %, OPM %, etc.
    if (metricName.includes("%") || metricName.includes("Growth") || metricName.includes("YoY") || metricName.includes("QoQ")) {
      return `${numValue.toFixed(2)}%`;
    }

    // Currency/Amount values: Sales, Net Profit, Operating Profit, EPS
    if (metricName.includes("Sales") || metricName.includes("Profit") || metricName === "EPS" || metricName.includes("EPS in Rs")) {
      // Values are typically in crores for Indian companies - format with ₹ symbol
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

    // Default: show 2 decimal places
    return numValue.toFixed(2);
  };

  // Calculate sector stats (company counts and signal distribution)
  const sectorsWithStats = useMemo(() => {
    if (!sectors || !allCompanies || !allSignals) return [];

    return sectors.map(sector => {
      const sectorCompanies = allCompanies.filter(c => c.sectorId === sector.id);
      const sectorCompanyIds = new Set(sectorCompanies.map(c => c.id));

      // Get signals for companies in this sector
      const sectorSignals = allSignals.filter(s => sectorCompanyIds.has(s.companyId));

      // Count signals by type
      const buyCount = sectorSignals.filter(s => s.signal === "BUY").length;
      const sellCount = sectorSignals.filter(s => s.signal === "SELL" || s.signal === "Check_OPM (Sell)").length;
      const holdCount = sectorSignals.filter(s => s.signal === "HOLD").length;
      const noSignalCount = sectorCompanies.length - sectorSignals.length;

      return {
        ...sector,
        companyCount: sectorCompanies.length,
        buySignals: buyCount,
        sellSignals: sellCount,
        holdSignals: holdCount,
        noSignals: noSignalCount,
        totalSignals: sectorSignals.length,
      };
    });
  }, [sectors, allCompanies, allSignals]);

  // Filter sectors based on search and filters
  const filteredSectors = useMemo(() => {
    if (!sectorsWithStats) return [];

    let filtered = sectorsWithStats;

    // Search filter
    if (sectorSearchTerm.trim()) {
      const term = sectorSearchTerm.toLowerCase();
      filtered = filtered.filter(sector =>
        sector.name.toLowerCase().includes(term) ||
        sector.description?.toLowerCase().includes(term)
      );
    }

    // Signal filter
    if (sectorSignalFilter !== "all") {
      filtered = filtered.filter(sector => {
        if (sectorSignalFilter === "has_buy") return sector.buySignals > 0;
        if (sectorSignalFilter === "has_sell") return sector.sellSignals > 0;
        if (sectorSignalFilter === "has_hold") return sector.holdSignals > 0;
        if (sectorSignalFilter === "has_signals") return sector.totalSignals > 0;
        if (sectorSignalFilter === "no_signals") return sector.totalSignals === 0;
        return true;
      });
    }

    // Company count filter
    if (sectorCompanyCountMin || sectorCompanyCountMax) {
      filtered = filtered.filter(sector => {
        const count = sector.companyCount;
        if (sectorCompanyCountMin && count < parseInt(sectorCompanyCountMin)) return false;
        if (sectorCompanyCountMax && count > parseInt(sectorCompanyCountMax)) return false;
        return true;
      });
    }

    return filtered;
  }, [sectorsWithStats, sectorSearchTerm, sectorSignalFilter, sectorCompanyCountMin, sectorCompanyCountMax]);

  // If no sector is selected, show sector list
  if (!displaySectorId) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Sectors
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Select a sector to view companies and quarterly data</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sectors..."
                value={sectorSearchTerm}
                onChange={(e) => setSectorSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <Button
                variant={sectorViewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setSectorViewMode("list")}
              >
                <List className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">List</span>
              </Button>
              <Button
                variant={sectorViewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setSectorViewMode("grid")}
              >
                <Grid3x3 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Grid</span>
              </Button>
            </div>
            {isAdmin && (
              <Dialog open={createSectorOpen} onOpenChange={setCreateSectorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Create Sector</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Sector</DialogTitle>
                    <DialogDescription>
                      Create a custom sector to organize companies.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Sector Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., My Tech Portfolio"
                        value={newSectorName}
                        onChange={(e) => setNewSectorName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Optional description..."
                        value={newSectorDescription}
                        onChange={(e) => setNewSectorDescription(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setCreateSectorOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateSector} disabled={createSectorMutation.isPending || !newSectorName}>
                      {createSectorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Filters */}
        <Collapsible open={sectorFiltersOpen} onOpenChange={setSectorFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${sectorFiltersOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <Label htmlFor="sector-signal-filter" className="text-sm font-medium">Signal Type</Label>
                <Select value={sectorSignalFilter} onValueChange={setSectorSignalFilter}>
                  <SelectTrigger id="sector-signal-filter" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    <SelectItem value="has_buy">Has BUY Signals</SelectItem>
                    <SelectItem value="has_sell">Has SELL Signals</SelectItem>
                    <SelectItem value="has_hold">Has HOLD Signals</SelectItem>
                    <SelectItem value="has_signals">Has Any Signals</SelectItem>
                    <SelectItem value="no_signals">No Signals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sector-company-count-min" className="text-sm font-medium">Company Count</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sector-company-count-min"
                    type="number"
                    placeholder="Min"
                    value={sectorCompanyCountMin}
                    onChange={(e) => setSectorCompanyCountMin(e.target.value)}
                    className="w-full"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    id="sector-company-count-max"
                    type="number"
                    placeholder="Max"
                    value={sectorCompanyCountMax}
                    onChange={(e) => setSectorCompanyCountMax(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {sectorsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredSectors && filteredSectors.length > 0 ? (
          sectorViewMode === "list" ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sector</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center">Companies</TableHead>
                        <TableHead className="text-center">BUY</TableHead>
                        <TableHead className="text-center">SELL</TableHead>
                        <TableHead className="text-center">HOLD</TableHead>
                        <TableHead className="text-center">No Signal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSectors.map((sector) => (
                        <TableRow key={sector.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            <Link href={`/sectors/${sector.id}`} className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold">{sector.name}</span>
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {sector.description || "—"}
                          </TableCell>
                          <TableCell className="text-center font-semibold">
                            {sector.companyCount}
                          </TableCell>
                          <TableCell className="text-center">
                            {sector.buySignals > 0 ? (
                              <Badge variant="outline" className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                                {sector.buySignals}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {sector.sellSignals > 0 ? (
                              <Badge variant="outline" className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                                {sector.sellSignals}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {sector.holdSignals > 0 ? (
                              <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
                                {sector.holdSignals}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {sector.noSignals > 0 ? (
                              <span className="text-muted-foreground">{sector.noSignals}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSectors.map((sector) => (
                <Link key={sector.id} href={`/sectors/${sector.id}`}>
                  <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                    <CardHeader className="p-3 sm:p-6">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {sector.name}
                      </CardTitle>
                      <CardDescription>{sector.description || "Click to view companies"}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Companies</span>
                          <span className="text-lg font-bold">{sector.companyCount}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <SignalBadge signal="BUY" showIcon={false} />
                              <span className="text-muted-foreground">BUY</span>
                            </div>
                            <span className="font-semibold">{sector.buySignals}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <SignalBadge signal="SELL" showIcon={false} />
                              <span className="text-muted-foreground">SELL</span>
                            </div>
                            <span className="font-semibold">{sector.sellSignals}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <SignalBadge signal="HOLD" showIcon={false} />
                              <span className="text-muted-foreground">HOLD</span>
                            </div>
                            <span className="font-semibold">{sector.holdSignals}</span>
                          </div>
                          {sector.noSignals > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">No Signal</span>
                              <span className="font-semibold text-muted-foreground">{sector.noSignals}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {sectorSearchTerm || sectorSignalFilter !== "all" || sectorCompanyCountMin || sectorCompanyCountMax
                ? "No sectors match your filters. Try adjusting the search or filter criteria."
                : "No sectors found"}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Show sector detail with companies and quarterly data
  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      <div className="flex items-center gap-2 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedSectorId(null)}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent truncate">
            {currentSector?.name || "Sector"} Sector
          </h1>
          <p className="text-muted-foreground mt-1">
            {currentSector?.description || `Companies in the ${currentSector?.name || ""} sector with quarterly financial data`}
          </p>
        </div>

        {isAdmin && (
          <div className="ml-auto flex gap-2 shrink-0">
            <Dialog open={manageMappingsOpen} onOpenChange={setManageMappingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Manage Mappings</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sector Mappings</DialogTitle>
                  <DialogDescription>
                    Map this custom sector to Screener.in sector names for scraping.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Screener Sector Name"
                      value={newMappingName}
                      onChange={(e) => setNewMappingName(e.target.value)}
                    />
                    <Button onClick={handleAddMapping} disabled={createMappingMutation.isPending || !newMappingName}>
                      {createMappingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Existing Mappings</Label>
                    {mappingsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : sectorMappings && sectorMappings.length > 0 ? (
                      <div className="space-y-2">
                        {sectorMappings.map((mapping) => (
                          <div key={mapping.id} className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                            <span className="font-medium">{mapping.screenerSector}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteMapping(mapping.id)}
                              disabled={deleteMappingMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm border rounded-md border-dashed">
                        No mappings found. Add a Screener.in sector name above.
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="companies" className="space-y-4">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
          <TabsTrigger value="companies" className="text-xs sm:text-sm">Companies List</TabsTrigger>
          <TabsTrigger value="quarterly" className="text-xs sm:text-sm">Quarterly Data</TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="space-y-4">
          {/* Signal Distribution Charts */}
          {filteredCompanies.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Signal Distribution</CardTitle>
                  <CardDescription>Breakdown of signals across companies</CardDescription>
                </CardHeader>
                <CardContent>
                  {signalsLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : pieChartData.length > 0 ? (
                    <ChartContainer
                      config={{
                        BUY: { label: "BUY", color: "hsl(142, 76%, 36%)" },
                        SELL: { label: "SELL", color: "hsl(0, 84%, 60%)" },
                        HOLD: { label: "HOLD", color: "hsl(38, 92%, 50%)" },
                        "No Signal": { label: "No Signal", color: "hsl(var(--muted))" },
                      }}
                      className="h-[300px]"
                    >
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No signal data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Signal Count</CardTitle>
                  <CardDescription>Number of companies by signal type</CardDescription>
                </CardHeader>
                <CardContent>
                  {signalsLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ChartContainer
                      config={{
                        count: { label: "Companies", color: "hsl(var(--primary))" },
                      }}
                      className="h-[300px]"
                    >
                      <BarChart data={barChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="signal" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies or tickers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={signalFilter} onValueChange={setSignalFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by signal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Signals</SelectItem>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                  <SelectItem value="HOLD">HOLD</SelectItem>
                  <SelectItem value="none">No Signal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Companies</CardTitle>
                  <CardDescription>
                    {filteredCompanies.length} companies in this sector
                    {signalFilter !== "all" && ` (filtered by ${signalFilter})`}
                  </CardDescription>
                </div>
                <Dialog open={bulkScrapeOpen} onOpenChange={setBulkScrapeOpen}>
                  <DialogTrigger asChild>
                    <Button
                      onClick={() => setScrapingSectorId(displaySectorId)}
                      disabled={!displaySectorId}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Bulk Scrape Sector
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Bulk Scrape Sector</DialogTitle>
                      <DialogDescription>
                        Scrape all companies in this sector. You can apply filters to scrape only specific companies.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Sector: {currentSector?.name}</Label>
                      </div>
                      <div className="space-y-2">
                        <Label>Market Cap Filters (in Crores)</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="market-cap-min">Minimum (Crores)</Label>
                            <Input
                              id="market-cap-min"
                              type="number"
                              placeholder="e.g., 5000"
                              value={marketCapMin}
                              onChange={(e) => setMarketCapMin(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="market-cap-max">Maximum (Crores)</Label>
                            <Input
                              id="market-cap-max"
                              type="number"
                              placeholder="e.g., 100000"
                              value={marketCapMax}
                              onChange={(e) => setMarketCapMax(e.target.value)}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Leave empty to scrape all companies. Market cap is in crores (e.g., 5000 = 5000 crores).
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setBulkScrapeOpen(false);
                            setMarketCapMin("");
                            setMarketCapMax("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleBulkScrape}
                          disabled={bulkScrapeMutation.isPending || !scrapingSectorId}
                        >
                          {bulkScrapeMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Starting...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Start Scraping
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {companiesLoading || signalsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || signalFilter !== "all"
                    ? `No companies found matching your filters`
                    : "No companies in this sector"}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">Ticker</TableHead>
                          <TableHead className="font-semibold">Company Name</TableHead>
                          <TableHead className="font-semibold">Signal</TableHead>
                          <TableHead className="text-right font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedCompanies.map((company) => {
                          const signalData = companySignalsMap?.[company.ticker];
                          const signal = signalData?.signal;
                          const signalSummary = signalData?.summary;

                          const getSignalBadge = (signal: string | null) => {
                            if (!signal) {
                              return <Badge variant="outline">No Signal</Badge>;
                            }

                            const variant = signal === "BUY" ? "default" :
                              signal === "SELL" ? "destructive" :
                                "secondary";
                            const colorClass = signal === "BUY" ? "bg-green-500 hover:bg-green-600" :
                              signal === "SELL" ? "bg-red-500 hover:bg-red-600" :
                                "bg-yellow-500 hover:bg-yellow-600";

                            return (
                              <div className="flex flex-col gap-1">
                                <Badge
                                  variant={variant}
                                  className={signal !== "HOLD" ? colorClass : undefined}
                                >
                                  {signal}
                                </Badge>
                                {signalSummary && signalSummary.total > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {signalSummary.buy > 0 && `${signalSummary.buy} BUY`}
                                    {signalSummary.sell > 0 && ` ${signalSummary.sell} SELL`}
                                    {signalSummary.hold > 0 && ` ${signalSummary.hold} HOLD`}
                                  </span>
                                )}
                              </div>
                            );
                          };

                          return (
                            <TableRow
                              key={company.id}
                              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            >
                              <TableCell>
                                <Link href={`/company/id/${company.id}`}>
                                  <span className="font-mono font-bold hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                    {company.ticker}
                                  </span>
                                </Link>
                              </TableCell>
                              <TableCell className="font-medium">{company.name}</TableCell>
                              <TableCell>
                                {getSignalBadge(signal ?? null)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {isAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleRefreshCompany(company.ticker);
                                      }}
                                      disabled={scrapingTickers.has(company.ticker)}
                                      title="Refresh company data"
                                    >
                                      {scrapingTickers.has(company.ticker) ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                  <Link href={`/company/id/${company.id}`}>
                                    <Button variant="ghost" size="sm">View Details</Button>
                                  </Link>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCompanies.length)} of {filteredCompanies.length} companies
                      </div>
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
                            // Show first page, last page, current page, and pages around current
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
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quarterly" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Quarterly Financial Data</CardTitle>
                  <CardDescription>
                    {sortedQuarterlyData ? `${sortedQuarterlyData.companies.length} companies, ${sortedQuarterlyData.quarters.length} quarters` : "Loading..."}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {displaySectorId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.location.href = `/formula-builder?type=sector&id=${displaySectorId}`;
                      }}
                    >
                      <Calculator className="h-4 w-4 mr-2" />
                      Build Formula
                    </Button>
                  )}
                  {sortedQuarterlyData && sortedQuarterlyData.metrics.length > 0 && (
                    <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Metrics</SelectItem>
                      {sortedQuarterlyData.metrics.map((metric) => (
                        <SelectItem key={metric} value={metric}>
                          {metric}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Formula Bar */}
              {showFormulaBar && (
                <div className="mb-6 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-4 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                      <Calculator className="h-4 w-4" />
                      Apply Formula to Selected Quarters
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFormulaBar(false)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Selected Quarters: {selectedQuartersForFormula.size > 0 ? Array.from(selectedQuartersForFormula).join(", ") : "None"}</Label>
                    <div className="flex gap-2">
                      <Select
                        value={selectedFormulaId || (activeSectorFormula ? "sector-default" : "default")}
                        onValueChange={(value) => {
                          if (value === "default" || value === "sector-default") {
                            setSelectedFormulaId("");
                            setUseCustomFormula(false);
                            // Use active sector formula if available
                            if (activeSectorFormula && value === "sector-default") {
                              setCustomFormula(activeSectorFormula.condition);
                              setCustomFormulaSignal(activeSectorFormula.signal);
                            } else {
                              setCustomFormula("");
                            }
                          } else {
                            setSelectedFormulaId(value);
                            setUseCustomFormula(false);
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select a formula" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={activeSectorFormula ? "sector-default" : "default"}>
                            {activeSectorFormula 
                              ? `Default: ${activeSectorFormula.name} (${activeSectorFormula.scope === "sector" ? "Sector" : "Global"})`
                              : "Use Custom Formula"}
                          </SelectItem>
                          {formulas?.filter(f => f.enabled).map((formula) => (
                            <SelectItem key={formula.id} value={formula.id}>
                              {formula.name} ({formula.signal})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={async () => {
                          if (selectedQuartersForFormula.size === 0) {
                            toast({
                              title: "No quarters selected",
                              description: "Please select at least one quarter column",
                              variant: "destructive"
                            });
                            return;
                          }

                          let formulaToUse = customFormula;
                          if (!useCustomFormula && selectedFormulaId) {
                            const formula = formulas?.find(f => f.id === selectedFormulaId);
                            if (formula) {
                              formulaToUse = formula.condition;
                            }
                          }
                          // If no custom formula and no selected formula, use active sector formula
                          if (!formulaToUse && activeSectorFormula) {
                            formulaToUse = activeSectorFormula.condition;
                          }

                          if (!formulaToUse) {
                            toast({
                              title: "No formula",
                              description: "Please select or enter a formula",
                              variant: "destructive"
                            });
                            return;
                          }

                          setIsEvaluating(true);
                          try {
                            // Evaluate for all visible companies
                            const results: Record<string, { result: string | number | boolean, type: string }> = {};

                            // Process companies sequentially to avoid overwhelming the server
                            for (const company of paginatedCompanies) {
                              try {
                                const res = await apiRequest("POST", "/api/v1/formulas/test-excel", {
                                  ticker: company.ticker,
                                  formula: formulaToUse,
                                  selectedQuarters: Array.from(selectedQuartersForFormula)
                                });
                                const data = await res.json();
                                // Handle both old format (result is object) and new format (result is primitive)
                                let actualResult = data.result;
                                let actualType = data.resultType;

                                // If result is an object with a nested result property, extract it
                                if (actualResult && typeof actualResult === 'object' && 'result' in actualResult) {
                                  actualType = actualResult.resultType || actualType;
                                  actualResult = actualResult.result;
                                }

                                results[company.ticker] = { result: actualResult, type: actualType };
                              } catch (err) {
                                console.error(`Failed to evaluate for ${company.ticker}`, err);
                                results[company.ticker] = { result: "Error", type: "error" };
                              }
                            }

                            setFormulaResults(results);
                            toast({
                              title: "Evaluation Complete",
                              description: `Evaluated formula for ${Object.keys(results).length} companies`,
                            });
                          } catch (error) {
                            toast({
                              title: "Evaluation failed",
                              description: (error as Error).message,
                              variant: "destructive"
                            });
                          } finally {
                            setIsEvaluating(false);
                          }
                        }}
                        disabled={selectedQuartersForFormula.size === 0 || isEvaluating}
                      >
                        {isEvaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
                        Evaluate
                      </Button>
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={async () => {
                          if (!customFormula && (!selectedFormulaId || selectedFormulaId === "default")) {
                            toast({
                              title: "No formula",
                              description: "Please enter a formula to save",
                              variant: "destructive"
                            });
                            return;
                          }

                          const formulaToSave = customFormula || formulas?.find(f => f.id === selectedFormulaId)?.condition;
                          if (!formulaToSave) return;

                          const name = prompt("Enter a name for this sector-specific formula:", `Custom Formula for ${currentSector?.name} Sector`);
                          if (!name) return;

                          try {
                            await apiRequest("POST", "/api/formulas", {
                              name,
                              scope: "sector",
                              scopeValue: displaySectorId,
                              condition: formulaToSave,
                              signal: customFormulaSignal,
                              priority: 2, // Default priority for sector formulas
                              enabled: true
                            });

                            toast({
                              title: "Formula Saved",
                              description: "This formula will now be used for this sector.",
                            });

                            // Refresh formulas
                            queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
                          } catch (error) {
                            toast({
                              title: "Failed to save",
                              description: (error as Error).message,
                              variant: "destructive"
                            });
                          }
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Save Formula
                      </Button>
                    </div>
                    {useCustomFormula || selectedFormulaId === "" || !selectedFormulaId ? (
                      <div className="space-y-2">
                        <Label>Custom Excel Formula</Label>
                        <Textarea
                          value={customFormula || (activeSectorFormula && !useCustomFormula ? activeSectorFormula.condition : "")}
                          onChange={(e) => {
                            setCustomFormula(e.target.value);
                            setUseCustomFormula(true);
                          }}
                          placeholder='IF(AND(Q14>0, P14>0, Q12>=20%, Q15>=20%, ...), "BUY", ...)'
                          className="font-mono text-sm min-h-24"
                        />
                        <div className="flex items-center gap-2">
                          <Label htmlFor="signal-type" className="text-xs">Expected Signal:</Label>
                          <Select value={customFormulaSignal} onValueChange={setCustomFormulaSignal}>
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BUY">BUY</SelectItem>
                              <SelectItem value="SELL">SELL</SelectItem>
                              <SelectItem value="HOLD">HOLD</SelectItem>
                              <SelectItem value="Check_OPM (Sell)">Check_OPM (Sell)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded text-sm font-mono text-muted-foreground">
                        {formulas?.find(f => f.id === selectedFormulaId)?.condition}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Compact Table View - Similar to Excel format */}
              {quarterlyData && quarterlyData.companies.length > 0 && (
                <div className="space-y-4 mb-6">
                  {/* Filters */}
                  <div className="flex gap-4 items-center flex-wrap">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search companies..."
                        value={quarterlySearchTerm}
                        onChange={(e) => setQuarterlySearchTerm(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-[200px] h-9 justify-between">
                            <span>
                              Metrics {selectedMetricsForTable.length > 0 && `(${selectedMetricsForTable.length})`}
                            </span>
                            <Filter className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <div className="p-4 border-b">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold">Select Metrics</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  if (selectedMetricsForTable.length === quarterlyData.metrics.length) {
                                    setSelectedMetricsForTable([]);
                                  } else {
                                    setSelectedMetricsForTable([...quarterlyData.metrics]);
                                  }
                                }}
                              >
                                {selectedMetricsForTable.length === quarterlyData.metrics.length ? "Deselect All" : "Select All"}
                              </Button>
                            </div>
                          </div>
                          <ScrollArea className="h-[300px]">
                            <div className="p-2 space-y-2">
                              {quarterlyData.metrics.map((metric) => (
                                <label key={metric} className="flex items-center space-x-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                                  <Checkbox
                                    checked={selectedMetricsForTable.includes(metric)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedMetricsForTable([...selectedMetricsForTable, metric]);
                                      } else {
                                        setSelectedMetricsForTable(selectedMetricsForTable.filter(m => m !== metric));
                                      }
                                    }}
                                  />
                                  <span className="text-sm flex-1">{metric}</span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-[200px] h-9 justify-between">
                            <span>
                              Quarters {selectedQuartersForTable.length > 0 && `(${selectedQuartersForTable.length})`}
                            </span>
                            <Filter className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="start">
                          <div className="p-4 border-b">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold">Select Quarters</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  if (!sortedQuarterlyData) return;
                                  if (selectedQuartersForTable.length === sortedQuarterlyData.quarters.length) {
                                    setSelectedQuartersForTable([]);
                                  } else {
                                    setSelectedQuartersForTable([...sortedQuarterlyData.quarters]);
                                  }
                                }}
                              >
                                {sortedQuarterlyData && selectedQuartersForTable.length === sortedQuarterlyData.quarters.length ? "Deselect All" : "Select All"}
                              </Button>
                            </div>
                          </div>
                          <ScrollArea className="h-[300px]">
                            <div className="p-2 space-y-2">
                              {sortedQuarterlyData?.quarters.map((quarter) => (
                                <label key={quarter} className="flex items-center space-x-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                                  <Checkbox
                                    checked={selectedQuartersForTable.includes(quarter)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedQuartersForTable([...selectedQuartersForTable, quarter]);
                                      } else {
                                        setSelectedQuartersForTable(selectedQuartersForTable.filter(q => q !== quarter));
                                      }
                                    }}
                                  />
                                  <span className="text-sm flex-1">{formatQuarterWithLabel(quarter)}</span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Spreadsheet View */}
                  <QuarterlyDataSpreadsheet
                    data={sortedQuarterlyData ? {
                      ...sortedQuarterlyData,
                      companies: filteredCompaniesForQuarterly
                        .filter(comp => sortedQuarterlyData.companies.some(c => c.ticker === comp.ticker))
                        .map(comp => sortedQuarterlyData.companies.find(c => c.ticker === comp.ticker)!)
                    } : undefined}
                    selectedMetrics={selectedMetricsForTable}
                    selectedQuarters={selectedQuartersForTable}
                    selectedCells={new Set(Array.from(selectedQuartersForFormula).flatMap(q =>
                      // Visual feedback for selected columns (quarters)
                      // We can't easily highlight entire columns in the spreadsheet component via this prop yet
                      // but we can pass the set of selected cells if we want specific highlighting
                      []
                    ))}
                    onCellSelect={(metric, quarter) => {
                      // When a cell is clicked, we want to add its reference to the formula
                      // Reference format: MetricName(RelativeIndex)
                      // e.g. Sales(0) for current quarter, Sales(-1) for previous

                      if (!sortedQuarterlyData) return;

                      // Find relative index
                      // sortedQuarterlyData.quarters is sorted oldest to newest? 
                      // Wait, `sortQuarterStrings` usually sorts chronologically.
                      // But for "Relative Index", 0 usually means "Most Recent".
                      // Let's check `sortQuarterStrings` behavior or `sortedQuarterlyData`

                      // In `SectorsList`, we did:
                      // quarters: sortQuarterStrings(quarterlyData.quarters)

                      // If we want 0 to be the LAST item in the sorted list (most recent),
                      // then index = quarters.indexOf(quarter) - (quarters.length - 1)
                      // e.g. length 10. Index 9 (last) -> 9 - 9 = 0.
                      // Index 8 (prev) -> 8 - 9 = -1.

                      const allQuarters = sortedQuarterlyData.quarters;
                      const index = allQuarters.indexOf(quarter);
                      const relativeIndex = index - (allQuarters.length - 1);

                      // Create reference string
                      // If metric has spaces, maybe wrap in brackets or underscores?
                      // Let's use underscores for now as per plan
                      const sanitizedMetric = metric.replace(/[^a-zA-Z0-9]/g, "_");
                      const reference = `${sanitizedMetric}(${relativeIndex})`;

                      // Insert into custom formula
                      setCustomFormula(prev => prev + (prev ? " " : "") + reference);
                      setUseCustomFormula(true);
                      setSelectedFormulaId(""); // Clear selected preset
                      setShowFormulaBar(true);

                      // Also add this quarter to selectedQuartersForFormula if not present
                      // so it gets sent to backend
                      const newSet = new Set(selectedQuartersForFormula);
                      newSet.add(quarter);
                      setSelectedQuartersForFormula(newSet);
                    }}
                    formulaResults={formulaResults}
                  />

                  <div className="text-xs text-muted-foreground mt-2">
                    <p><strong>Tip:</strong> Click on any cell to add its reference to the formula bar. References are relative to the most recent quarter (0).</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

