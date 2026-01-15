import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CheckCircle2, XCircle, Settings, Calculator, CheckSquare, Square, RefreshCw, Loader2, Edit, Code2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs as SettingsTabs, TabsContent as SettingsTabsContent, TabsList as SettingsTabsList, TabsTrigger as SettingsTabsTrigger } from "@/components/ui/tabs";
import SignalBadge from "@/components/SignalBadge";
import { ArrowLeft, AlertCircle, TrendingUp, BarChart3, Info } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Company, Sector, Signal, Formula } from "@shared/schema";
import { format } from "date-fns";
import { evaluateQuarterlyFormula } from "@/utils/quarterlyFormulaEvaluator";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { sortQuarters, formatQuarterWithLabel } from "@/utils/quarterUtils";
import QuarterlyDataSpreadsheet from "@/components/QuarterlyDataSpreadsheet";
import { FormulaEditor } from "@/components/FormulaEditor";
import FormulaEvaluationTrace from "@/components/FormulaEvaluationTrace";

const formatCurrency = (value: number): string => {
  // Format in Indian currency (Rupees) with Crores/Lakhs/Thousands
  if (Math.abs(value) >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  if (Math.abs(value) >= 1000) {
    return `₹${(value / 1000).toFixed(2)} K`;
  }
  return `₹${value.toFixed(2)}`;
};

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;

const formatIndianCurrency = (value: number): string => {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(2)} K`;
  }
  return `₹${value.toFixed(2)}`;
};

export default function CompanyDetail() {
  // Support both /company/:ticker (legacy) and /company/id/:id routes
  const [matchTicker, paramsTicker] = useRoute("/company/:ticker");
  const [matchId, paramsId] = useRoute("/company/id/:id");

  const companyId = paramsId?.id;
  const ticker = paramsTicker?.ticker?.toUpperCase();
  const match = matchTicker || matchId; // Either route match is valid
  const { toast } = useToast();

  // Analysis state
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>("");
  const [customFormula, setCustomFormula] = useState<string>("");
  const [customFormulaSignal, setCustomFormulaSignal] = useState<string>("BUY");
  const [useCustomFormula, setUseCustomFormula] = useState(false);
  const [selectedQuartersForFormula, setSelectedQuartersForFormula] = useState<Set<string>>(new Set());
  const [formulaResultForSelected, setFormulaResultForSelected] = useState<string | null>(null);
  const [showFormulaBar, setShowFormulaBar] = useState(false);
  const formulaInputRef = useRef<HTMLTextAreaElement>(null);
  const formulaDropdownDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [showTraceModal, setShowTraceModal] = useState(false);

  // Ticker update dialog state
  const [showTickerUpdateDialog, setShowTickerUpdateDialog] = useState(false);
  const [newTicker, setNewTicker] = useState<string>("");
  const [isValidatingTicker, setIsValidatingTicker] = useState(false);
  const [tickerValidationResult, setTickerValidationResult] = useState<{ valid: boolean; companyName?: string; error?: string } | null>(null);

  // Company details update dialog state
  const [showUpdateCompanyDialog, setShowUpdateCompanyDialog] = useState(false);
  const [updateTicker, setUpdateTicker] = useState<string>("");
  const [updateSectorId, setUpdateSectorId] = useState<string>("");
  const [isValidatingUpdateTicker, setIsValidatingUpdateTicker] = useState(false);
  const [updateTickerValidationResult, setUpdateTickerValidationResult] = useState<{ valid: boolean; companyName?: string; error?: string } | null>(null);

  // Metrics editor dialog state
  const [showMetricsEditorDialog, setShowMetricsEditorDialog] = useState(false);
  const [pastedMetricsText, setPastedMetricsText] = useState<string>("");
  const [parsedMetrics, setParsedMetrics] = useState<Record<string, number | null>>({});

  // Fetch data type dialog state
  const [showFetchDataDialog, setShowFetchDataDialog] = useState(false);
  const [selectedDataType, setSelectedDataType] = useState<'consolidated' | 'standalone'>('consolidated');

  // Fetch company by ID or ticker
  const { data: company, isLoading: companyLoading, error: companyError } = useQuery<Company>({
    queryKey: companyId
      ? ["/api/companies", companyId]
      : ["/api/companies/ticker", ticker],
    queryFn: async () => {
      if (companyId) {
        const res = await apiRequest("GET", `/api/companies/${companyId}`);
        return res.json();
      } else if (ticker) {
        const res = await apiRequest("GET", `/api/companies/ticker/${ticker}`);
        return res.json();
      }
      throw new Error("No company ID or ticker provided");
    },
    enabled: !!(companyId || ticker)
  });

  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  // Fetch quarterly data - use ticker from company or params
  const companyTicker = company?.ticker || ticker;
  const { data: quarterlyData, isLoading: quarterlyLoading } = useQuery<{
    ticker: string;
    quarters: Array<{
      quarter: string;
      scrapeTimestamp: string | null;
      metrics: Record<string, string | null>;
    }>;
    raw: any[];
  }>({
    queryKey: ["/api/v1/companies", companyTicker, "data"],
    enabled: !!companyTicker
  });

  // Sort quarterly data chronologically (oldest to newest)
  const sortedQuarterlyData = useMemo(() => {
    if (!quarterlyData) return null;
    return {
      ...quarterlyData,
      quarters: sortQuarters(quarterlyData.quarters)
    };
  }, [quarterlyData]);

  // Fetch signals using new endpoint - prefer companyId (more precise) but support ticker fallback
  const { data: signalsData, isLoading: signalsLoading } = useQuery<{
    ticker: string;
    companyId: string;
    companyName: string;
    assignedFormulaId: string | null;
    signals: Array<Signal & { formula?: any }>;
    summary: {
      total: number;
      buy: number;
      sell: number;
      hold: number;
    };
    effectiveFormula: {
      id: string;
      name: string;
      signal: string;
      scope: string;
    } | null;
    formulaSource: "company" | "sector" | "global";
  }>({
    queryKey: ["/api/v1/companies", company?.id || companyTicker, "signals"],
    queryFn: async () => {
      if (!companyTicker) throw new Error("No ticker available for signals");
      // Prefer company.id when available to disambiguate tickers
      const url = company?.id
        ? `/api/v1/companies/${companyTicker}/signals?companyId=${company.id}`
        : `/api/v1/companies/${companyTicker}/signals`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!companyTicker
  });

  const signals = signalsData?.signals || [];
  const signalsSummary = signalsData?.summary;

  // Sort signals - must be called before any early returns (React Rules of Hooks)
  const sortedSignals = useMemo(() => {
    if (!signals || signals.length === 0) return [];
    return [...signals].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [signals]);

  // Fetch formulas for analysis
  const { data: formulas } = useQuery<Formula[]>({
    queryKey: ["/api/formulas"],
    enabled: !!ticker
  });

  // Fetch entity-specific formula (company-specific > sector-specific > global)
  const { data: entityFormulaData } = useQuery<{ formula: Formula | null }>({
    queryKey: ["/api/v1/formulas/entity", "company", company?.id],
    queryFn: async () => {
      if (!company?.id) return { formula: null };
      const res = await apiRequest("GET", `/api/v1/formulas/entity/company/${company.id}`);
      return res.json();
    },
    enabled: !!company?.id
  });

  // Get applicable formula (entity-specific > global)
  const globalFormula = useMemo(() => {
    if (!formulas) return null;
    // Find enabled global formulas, sorted by priority (lower priority = higher precedence)
    const globalFormulas = formulas
      .filter(f => f.enabled && f.scope === "global")
      .sort((a, b) => a.priority - b.priority);
    return globalFormulas[0] || null;
  }, [formulas]);

  // Get active formula: entity-specific > global
  const activeFormulaForPage = useMemo(() => {
    return entityFormulaData?.formula || globalFormula;
  }, [entityFormulaData, globalFormula]);

  // Get available metrics from quarterly data - gather ALL unique metrics across ALL quarters
  const availableMetrics = useMemo(() => {
    if (!sortedQuarterlyData || sortedQuarterlyData.quarters.length === 0) return [];
    
    // Collect all unique metric names from all quarters
    const metricSet = new Set<string>();
    sortedQuarterlyData.quarters.forEach(q => {
      Object.keys(q.metrics).forEach(metric => metricSet.add(metric));
    });
    
    return Array.from(metricSet).sort();
  }, [sortedQuarterlyData]);

  // Fetch default metrics from settings (includes order information)
  const { data: defaultMetricsData } = useQuery<{
    metrics: Record<string, boolean>;
    visibleMetrics: string[];
    bankingMetrics?: Record<string, boolean>;
    visibleBankingMetrics?: string[];
    metricsOrder?: string[];
    bankingMetricsOrder?: string[];
    orderedVisibleMetrics?: string[];
    orderedVisibleBankingMetrics?: string[];
  }>({
    queryKey: ["/api/settings/default-metrics"],
    retry: 1, // Retry once if it fails
  });



  // Auto-calculate signals when company detail page loads (async, non-blocking)
  useEffect(() => {
    if (!company?.id) return;
    
    // Calculate and update signals for this company (async mode to avoid blocking UI)
    const calculateSignals = async () => {
      try {
        const response = await apiRequest("POST", "/api/signals/calculate", {
          companyIds: [company.id],
          incremental: false,
          async: true // Use async mode to avoid blocking UI
        });
        const data = await response.json();
        
        // Show toast notification that calculation is running
        if (data.jobId) {
          toast({
            title: "Signal calculation started",
            description: "Signals are being recalculated in the background. The page will update automatically.",
          });
        }
        
        // Refresh signals after a delay to allow calculation to complete
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "data"] });
          queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", company.id || companyTicker, "signals"] });
          queryClient.refetchQueries({ queryKey: ["/api/v1/companies", companyTicker, "signals"] });
        }, 2000);
      } catch (error) {
        // Show error toast instead of silently failing
        toast({
          title: "Failed to start signal calculation",
          description: error instanceof Error ? error.message : "An error occurred while calculating signals",
          variant: "destructive"
        });
        console.error("Error calculating signals on page load:", error);
      }
    };
    
    calculateSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]); // Only run when company ID changes (i.e., when page loads with a new company)

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (formulaDropdownDebounceRef.current) {
        clearTimeout(formulaDropdownDebounceRef.current);
      }
    };
  }, []);

  // Auto-select last 12 quarters for formula evaluation when data loads
  useEffect(() => {
    if (sortedQuarterlyData && sortedQuarterlyData.quarters.length > 0 && selectedQuartersForFormula.size === 0) {
      const quartersForFormula = sortedQuarterlyData.quarters.length > 12
        ? sortedQuarterlyData.quarters.slice(-12)
        : sortedQuarterlyData.quarters;
      setSelectedQuartersForFormula(new Set(quartersForFormula.map(q => q.quarter)));
    }
  }, [sortedQuarterlyData, selectedQuartersForFormula.size]);

  // Helper function to check if a company is in a banking sector
  const isBankingCompany = useMemo(() => {
    if (!company?.sectorId || !sectors) return false;
    const sector = sectors.find(s => s.id === company.sectorId);
    if (!sector) return false;
    const sectorName = sector.name.toLowerCase();
    return sectorName.includes('bank') || sectorName.includes('banking') || sectorName.includes('financial');
  }, [company?.sectorId, sectors]);

  // Filter metrics based on settings - use banking metrics for banking companies, default for others
  const filteredMetrics = useMemo(() => {
    // Use banking metrics if this is a banking company, otherwise use default metrics
    // Prefer ordered visible metrics (respects display order from settings)
    if (isBankingCompany) {
      if (defaultMetricsData?.orderedVisibleBankingMetrics && defaultMetricsData.orderedVisibleBankingMetrics.length > 0) {
        return defaultMetricsData.orderedVisibleBankingMetrics;
      } else if (defaultMetricsData?.visibleBankingMetrics && defaultMetricsData.visibleBankingMetrics.length > 0) {
        return defaultMetricsData.visibleBankingMetrics;
      }
    } else {
      if (defaultMetricsData?.orderedVisibleMetrics && defaultMetricsData.orderedVisibleMetrics.length > 0) {
        return defaultMetricsData.orderedVisibleMetrics;
      } else if (defaultMetricsData?.visibleMetrics && defaultMetricsData.visibleMetrics.length > 0) {
        return defaultMetricsData.visibleMetrics;
      }
    }
    
    // Only if API hasn't loaded yet or failed, show empty array (will be populated once data loads)
    // This ensures we always show what's saved in the database, not hardcoded defaults
    return [];
  }, [defaultMetricsData, isBankingCompany]);

  const filteredQuarters = useMemo(() => {
    if (!sortedQuarterlyData) return [];
    // Always use last 12 quarters (most recent)
    const len = sortedQuarterlyData.quarters.length;
    return len > 12
      ? sortedQuarterlyData.quarters.slice(len - 12)
      : sortedQuarterlyData.quarters;
  }, [sortedQuarterlyData]);

  // Get active formula
  // Priority: Custom formula > Selected formula > Entity-specific formula > Global formula (default)
  const activeFormula = useMemo(() => {
    if (useCustomFormula && customFormula.trim()) {
      return {
        id: "custom",
        condition: customFormula.trim(),
        signal: customFormulaSignal,
      } as Formula;
    }
    if (selectedFormulaId && formulas) {
      const selected = formulas.find(f => f.id === selectedFormulaId);
      if (selected) return selected;
    }
    // Default to entity-specific formula if available, otherwise global formula
    return activeFormulaForPage || globalFormula;
  }, [useCustomFormula, customFormula, customFormulaSignal, selectedFormulaId, formulas, activeFormulaForPage, globalFormula]);

  // Get latest signal early so we can use it in formulaResult
  const latestSignal = useMemo(() => {
    if (!signalsData?.signals || signalsData.signals.length === 0) return null;
    const sorted = [...signalsData.signals].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted[0] || null;
  }, [signalsData]);

  // Use the actual signal from the server instead of trying to re-evaluate on frontend
  // Frontend evaluator can't handle Excel formulas (Q12, Q11, etc.), so use server-calculated signal
  const formulaResult = useMemo(() => {
    // If we have a signal from the server, use that (it's already correctly calculated)
    if (latestSignal?.signal) {
      return latestSignal.signal;
    }

    // Fallback: Try frontend evaluation only for simple formulas (not Excel formulas)
    // This is a best-effort fallback, but Excel formulas should always come from the server
    if (!sortedQuarterlyData || filteredQuarters.length === 0) {
      return "No Signal";
    }

    // If no formula is available, return No Signal (not HOLD - formulas should return signals dynamically)
    if (!activeFormula) {
      return "No Signal";
    }

    // Check if this is an Excel formula (contains Q12, Q11, etc.)
    // Excel formulas should always be evaluated on the server
    if (activeFormula.formulaType === 'excel' || /[QP]\d+/.test(activeFormula.condition)) {
      // Can't evaluate Excel formulas on frontend, return No Signal if no server signal
      // Don't default to HOLD - formulas should return signals dynamically
      return "No Signal";
    }

    const selectedQuarterNames = filteredQuarters.map(q => q.quarter);
    const availableMetrics = sortedQuarterlyData.quarters[0] ? Object.keys(sortedQuarterlyData.quarters[0].metrics) : [];

    // Evaluate simple formulas on frontend as fallback
    const signal = evaluateQuarterlyFormula(
      sortedQuarterlyData,
      selectedQuarterNames,
      activeFormula,
      availableMetrics
    );

    // Return No Signal if no signal matches - don't default to HOLD
    // Formulas should return signals dynamically, not default to HOLD
    return signal || "No Signal";
  }, [latestSignal, activeFormula, sortedQuarterlyData, filteredQuarters]);

  // Always show signal column if we have quarterly data
  const showSignalColumn = sortedQuarterlyData && sortedQuarterlyData.quarters.length > 0;

  // Fetch scraping history
  const { data: lastScrape } = useQuery<{ ticker: string; lastScrape: string | null }>({
    queryKey: ["/api/v1/companies", companyTicker, "last-scrape"],
    queryFn: async () => {
      if (!companyTicker) throw new Error("No ticker");
      const res = await apiRequest("GET", `/api/v1/companies/${companyTicker}/last-scrape`);
      return res.json();
    },
    enabled: !!companyTicker,
  });

  // Helper function to detect if error is ticker-related
  // Note: "No quarterly data found" is NOT a ticker error - it means ticker is valid but company has no quarterly data
  const isTickerError = (error: any, data?: any): boolean => {
    if (data && data.success === false) {
      const errorMsg = (data.error || "").toLowerCase();
      // If companyName is present, ticker is valid - it's not a ticker error
      if (data.companyName) {
        return false;
      }
      // Only treat as ticker error if company itself is not found
      return errorMsg.includes("company not found") ||
        errorMsg.includes("ticker not found") ||
        errorMsg.includes("invalid ticker") ||
        errorMsg.includes("404");
    }
    if (error) {
      const errorMsg = (error.message || "").toLowerCase();
      return errorMsg.includes("not found") &&
        !errorMsg.includes("quarterly data") &&
        (errorMsg.includes("company") || errorMsg.includes("ticker")) ||
        errorMsg.includes("404");
    }
    return false;
  };

  // Handle cell selection for formula building
  const handleCellSelect = (metric: string, quarter: string) => {
    if (!showFormulaBar && !useCustomFormula) return;
    if (!sortedQuarterlyData) return;

    // Enable custom formula mode if not already enabled
    if (!useCustomFormula) {
      setUseCustomFormula(true);
      // If formula bar wasn't open, open it
      if (!showFormulaBar) setShowFormulaBar(true);
    }

    // Use filteredQuarters to respect the current window
    const index = filteredQuarters.findIndex(q => q.quarter === quarter);
    if (index === -1) return;

    // Calculate Qn (1-based index from Oldest in window)
    // filteredQuarters is sorted oldest to newest (index 0 is oldest)
    // So Q1 is index 0 + 1
    const qIndex = index + 1;

    // Create reference string
    const sanitizedMetric = metric.replace(/[^a-zA-Z0-9]/g, "");
    const reference = `${sanitizedMetric}[Q${qIndex}]`;

    // Insert into formula at cursor position or replace selection
    if (formulaInputRef.current) {
      const textarea = formulaInputRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const scrollTop = textarea.scrollTop; // Capture scroll position

      const newText = text.substring(0, start) + reference + text.substring(end);

      setCustomFormula(newText);

      // Restore focus and cursor position after update
      setTimeout(() => {
        if (formulaInputRef.current) {
          formulaInputRef.current.focus();
          const newCursorPos = start + reference.length;
          formulaInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          formulaInputRef.current.scrollTop = scrollTop; // Restore scroll position
        }
      }, 0);
    } else {
      // Fallback
      setCustomFormula(prev => prev + (prev ? " " : "") + reference);
    }
  };

  // Mutation for fetching latest data
  const fetchLatestDataMutation = useMutation({
    mutationFn: async (dataType: 'consolidated' | 'standalone' = 'consolidated') => {
      if (!companyTicker) throw new Error("No ticker available");
      const res = await apiRequest("POST", "/api/v1/scraper/scrape/single", {
        ticker: companyTicker,
        sectorId: company?.sectorId,
        dataType
      });
      const data = await res.json();
      // Only throw error if it's a ticker error (ticker doesn't exist)
      // If ticker is valid but no quarterly data found, return the data to handle in onSuccess
      if (!res.ok || (data.success === false && isTickerError(null, data))) {
        throw new Error(data.error || "Failed to fetch data");
      }
      return data;
    },
    onSuccess: (data) => {
      // Close the fetch data dialog
      setShowFetchDataDialog(false);

      // Check if fetch failed
      if (data.success === false) {
        // Check if no data was found from the selected source
        if (data.noDataFromSource) {
          const dataTypeName = data.dataType === 'standalone' ? 'Standalone' : 'Consolidated';
          toast({
            title: `No ${dataTypeName} Data Found`,
            description: `${dataTypeName} data returned no results for ${companyTicker}. Database was NOT updated. Try the other data type.`,
            variant: "destructive"
          });
          return;
        }

        // Check if it's a ticker error (ticker doesn't exist)
        if (isTickerError(null, data)) {
          setNewTicker(companyTicker || "");
          setShowTickerUpdateDialog(true);
          setTickerValidationResult(null);
          toast({
            title: "Ticker may be incorrect",
            description: data.error || "No data found for this ticker. Please verify and update the ticker.",
            variant: "destructive"
          });
          return;
        }

        // If ticker is valid but no quarterly data found, show informational message
        if (data.companyName && data.error?.toLowerCase().includes("no quarterly data")) {
          toast({
            title: "No quarterly data available",
            description: `Ticker "${data.ticker}" is valid for "${data.companyName}", but no quarterly data is available on Screener.in.`,
            variant: "default"
          });
          // Still invalidate queries to refresh the page
          queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "data"] });
          queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "signals"] });
          queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "last-scrape"] });
          queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", companyTicker] });
          return;
        }

        // Other errors
        toast({
          title: "Failed to fetch data",
          description: data.error || "An error occurred while fetching data.",
          variant: "destructive"
        });
        return;
      }

      // Success case
      const dataTypeName = data.dataType === 'standalone' ? 'Standalone' : 'Consolidated';
      const actualSource = data.quarterlyDataSource === 'fallback' 
        ? (data.dataType === 'standalone' ? 'Consolidated' : 'Standalone')
        : dataTypeName;
      const fallbackNote = data.quarterlyDataSource === 'fallback' 
        ? ` (automatically used ${actualSource} as ${dataTypeName} was not available)`
        : '';
      toast({
        title: "Data fetched successfully",
        description: `Scraped ${data.quartersScraped || 0} quarters and ${data.metricsScraped || 0} metrics from ${actualSource} source${fallbackNote}`
      });
      // Invalidate all related queries to refresh the page
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "last-scrape"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", companyTicker] });
    },
    onError: (error: Error) => {
      // Check if error is ticker-related
      if (isTickerError(error)) {
        setNewTicker(companyTicker || "");
        setShowTickerUpdateDialog(true);
        setTickerValidationResult(null);
        toast({
          title: "Ticker may be incorrect",
          description: error.message || "No data found for this ticker. Please verify and update the ticker.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Failed to fetch data",
          description: error.message,
          variant: "destructive"
        });
      }
    },
  });

  // Mutation for assigning formula to company
  const assignFormulaMutation = useMutation({
    mutationFn: async (formulaId: string | null) => {
      if (!company?.id) throw new Error("Company ID not available");
      const res = await apiRequest("PUT", `/api/v1/companies/${company.id}/assign-formula`, { formulaId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Formula assigned & signal calculated",
        description: data.message
      });
      
      // Backend route already calculates signals synchronously, so no need to recalculate here
      // Force refetch signals data to show updated formula and signal
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", companyTicker, "signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", company?.id || companyTicker, "signals"] });
      queryClient.refetchQueries({ queryKey: ["/api/v1/companies", companyTicker, "signals"] });
      queryClient.refetchQueries({ queryKey: ["/api/v1/companies", company?.id || companyTicker, "signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/formulas/entity", "company", company?.id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to assign formula",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation for validating ticker
  const validateTickerMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("GET", `/api/v1/companies/metadata/${ticker}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.exists) {
        setTickerValidationResult({
          valid: true,
          companyName: data.companyName
        });
        toast({
          title: "Ticker is valid",
          description: `Found company: ${data.companyName}`
        });
      } else {
        setTickerValidationResult({
          valid: false,
          error: "Company not found on Screener.in"
        });
      }
    },
    onError: (error: Error) => {
      setTickerValidationResult({
        valid: false,
        error: error.message || "Failed to validate ticker"
      });
    },
  });

  // Mutation for updating ticker
  const updateTickerMutation = useMutation({
    mutationFn: async (ticker: string) => {
      if (!company?.id) throw new Error("Company ID not available");
      const res = await apiRequest("PUT", `/api/companies/${company.id}`, {
        ticker: ticker.toUpperCase()
      });
      return res.json();
    },
    onSuccess: async (updatedCompany) => {
      toast({
        title: "Ticker updated successfully",
        description: `Ticker updated to ${updatedCompany.ticker}`
      });

      // Invalidate queries to refresh company data
      await queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", companyTicker] });
      await queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", updatedCompany.ticker] });

      // Refetch company data to get updated ticker
      await queryClient.refetchQueries({ queryKey: ["/api/companies", company?.id] });

      // Close dialog
      setShowTickerUpdateDialog(false);
      setTickerValidationResult(null);
      setNewTicker("");

      // Wait a bit for queries to refresh, then retry fetch with new ticker
      setTimeout(() => {
        // Use the updated ticker directly
        if (updatedCompany.ticker) {
          apiRequest("POST", "/api/v1/scraper/scrape/single", {
            ticker: updatedCompany.ticker,
            sectorId: company?.sectorId
          }).then(async (res) => {
            const data = await res.json();
            if (data.success) {
              toast({
                title: "Data fetched successfully",
                description: `Scraped ${data.quartersScraped || 0} quarters and ${data.metricsScraped || 0} metrics`
              });
              // Invalidate all related queries to refresh the page
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", updatedCompany.ticker, "data"] });
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", updatedCompany.ticker, "signals"] });
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", updatedCompany.ticker, "last-scrape"] });
              queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
              queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", updatedCompany.ticker] });
            } else {
              // If still failing, show dialog again
              if (isTickerError(null, data)) {
                setNewTicker(updatedCompany.ticker);
                setShowTickerUpdateDialog(true);
                setTickerValidationResult(null);
                toast({
                  title: "Still unable to fetch data",
                  description: data.error || "Please verify the ticker is correct",
                  variant: "destructive"
                });
              }
            }
          }).catch((error: Error) => {
            toast({
              title: "Failed to fetch data",
              description: error.message,
              variant: "destructive"
            });
          });
        }
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update ticker",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Handle validate ticker button click
  const handleValidateTicker = () => {
    if (!newTicker.trim()) {
      toast({
        title: "Please enter a ticker",
        variant: "destructive"
      });
      return;
    }
    setIsValidatingTicker(true);
    setTickerValidationResult(null);
    validateTickerMutation.mutate(newTicker.trim().toUpperCase(), {
      onSettled: () => {
        setIsValidatingTicker(false);
      }
    });
  };

  // Handle update ticker and retry
  const handleUpdateTickerAndRetry = () => {
    if (!tickerValidationResult?.valid) {
      toast({
        title: "Please validate ticker first",
        variant: "destructive"
      });
      return;
    }
    if (!newTicker.trim()) {
      toast({
        title: "Please enter a ticker",
        variant: "destructive"
      });
      return;
    }
    updateTickerMutation.mutate(newTicker.trim().toUpperCase());
  };

  // Initialize update company dialog when opened
  useEffect(() => {
    if (showUpdateCompanyDialog && company) {
      setUpdateTicker(company.ticker);
      setUpdateSectorId(company.sectorId || "");
      setUpdateTickerValidationResult(null);
    }
  }, [showUpdateCompanyDialog, company]);

  // Mutation for validating ticker in update company dialog
  const validateUpdateTickerMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("GET", `/api/v1/companies/metadata/${ticker}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.exists) {
        setUpdateTickerValidationResult({
          valid: true,
          companyName: data.companyName
        });
        toast({
          title: "Ticker is valid",
          description: `Found company: ${data.companyName}`
        });
      } else {
        setUpdateTickerValidationResult({
          valid: false,
          error: "Company not found on Screener.in"
        });
      }
    },
    onError: (error: Error) => {
      setUpdateTickerValidationResult({
        valid: false,
        error: error.message || "Failed to validate ticker"
      });
    },
  });

  // Mutation for updating company details
  const updateCompanyDetailsMutation = useMutation({
    mutationFn: async (data: { ticker?: string; sectorId?: string }) => {
      if (!company?.id) throw new Error("Company ID not available");
      const res = await apiRequest("PUT", `/api/companies/${company.id}`, data);
      return res.json();
    },
    onSuccess: async (updatedCompany) => {
      const tickerChanged = updatedCompany.ticker !== company?.ticker;

      toast({
        title: "Company updated successfully",
        description: tickerChanged
          ? `Ticker updated to ${updatedCompany.ticker}. Fetching latest data...`
          : "Company details updated successfully"
      });

      // Invalidate queries to refresh company data
      await queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", companyTicker] });
      if (tickerChanged) {
        await queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", updatedCompany.ticker] });
      }

      // Refetch company data
      await queryClient.refetchQueries({ queryKey: ["/api/companies", company?.id] });

      // Close dialog
      setShowUpdateCompanyDialog(false);
      setUpdateTickerValidationResult(null);
      setUpdateTicker("");
      setUpdateSectorId("");

      // If ticker changed, automatically fetch latest data
      if (tickerChanged && updatedCompany.ticker) {
        setTimeout(() => {
          apiRequest("POST", "/api/v1/scraper/scrape/single", {
            ticker: updatedCompany.ticker,
            sectorId: updatedCompany.sectorId || company?.sectorId
          }).then(async (res) => {
            const data = await res.json();
            if (data.success) {
              toast({
                title: "Data fetched successfully",
                description: `Scraped ${data.quartersScraped || 0} quarters and ${data.metricsScraped || 0} metrics`
              });
              // Invalidate all related queries to refresh the page
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", updatedCompany.ticker, "data"] });
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", updatedCompany.ticker, "signals"] });
              queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", updatedCompany.ticker, "last-scrape"] });
              queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
              queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", updatedCompany.ticker] });
            } else {
              // If still failing, show ticker update dialog
              if (isTickerError(null, data)) {
                setNewTicker(updatedCompany.ticker);
                setShowTickerUpdateDialog(true);
                setTickerValidationResult(null);
                toast({
                  title: "Unable to fetch data",
                  description: data.error || "Please verify the ticker is correct",
                  variant: "destructive"
                });
              }
            }
          }).catch((error: Error) => {
            toast({
              title: "Failed to fetch data",
              description: error.message,
              variant: "destructive"
            });
          });
        }, 1000);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update company",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Handle validate update ticker
  const handleValidateUpdateTicker = () => {
    if (!updateTicker.trim()) {
      toast({
        title: "Please enter a ticker",
        variant: "destructive"
      });
      return;
    }
    setIsValidatingUpdateTicker(true);
    setUpdateTickerValidationResult(null);
    validateUpdateTickerMutation.mutate(updateTicker.trim().toUpperCase(), {
      onSettled: () => {
        setIsValidatingUpdateTicker(false);
      }
    });
  };

  // Parse metrics from pasted text
  const parseMetricsFromText = (text: string): Record<string, number | null> => {
    const metrics: Record<string, number | null> = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Metric name to key mapping
    const metricMap: Record<string, string> = {
      'Market Cap': 'marketCap',
      'Current Price': 'currentPrice',
      'High / Low': 'highPrice',
      'High/Low': 'highPrice',
      'Stock P/E': 'pe',
      'Stock P/E Ratio': 'pe',
      'P/E': 'pe',
      'Book Value': 'bookValue',
      'Dividend Yield': 'dividendYield',
      'ROCE': 'roce',
      'ROE': 'roe',
      'Face Value': 'faceValue',
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Check if this line is a metric name
      for (const [metricName, key] of Object.entries(metricMap)) {
        if (line.toLowerCase().includes(metricName.toLowerCase())) {
          // Look for value in current or next line
          let valueLine = lines[i];
          if (!valueLine.match(/[\d.,₹%]/)) {
            // If current line doesn't have numbers, check next line
            if (i + 1 < lines.length) {
              valueLine = lines[i + 1];
              i++; // Skip next line since we're using it
            }
          }
          
          // Extract value
          let value: number | null = null;
          
          // Handle Market Cap (e.g., "₹ 976 Cr." or "976 Cr")
          if (key === 'marketCap') {
            const match = valueLine.match(/₹?\s*([\d,.]+)\s*Cr\.?/i);
            if (match) {
              value = parseFloat(match[1].replace(/,/g, '')) * 10000000; // Convert crores to actual value
            }
          }
          // Handle High / Low (e.g., "₹ 33.5 / 22.0")
          else if (key === 'highPrice') {
            const match = valueLine.match(/₹?\s*([\d,.]+)\s*\/\s*₹?\s*([\d,.]+)/i);
            if (match) {
              metrics.highPrice = parseFloat(match[1].replace(/,/g, ''));
              metrics.lowPrice = parseFloat(match[2].replace(/,/g, ''));
              value = metrics.highPrice; // Set value for highPrice key
              // Don't break here, continue to set the value
            }
          }
          // Handle percentage metrics (ROCE, ROE, Dividend Yield)
          else if (key === 'roce' || key === 'roe' || key === 'dividendYield') {
            const match = valueLine.match(/([\d,.]+)\s*%/i);
            if (match) {
              value = parseFloat(match[1].replace(/,/g, ''));
            }
          }
          // Handle currency metrics (Current Price, Book Value, Face Value)
          else if (key === 'currentPrice' || key === 'bookValue' || key === 'faceValue') {
            const match = valueLine.match(/₹?\s*([\d,.]+)/i);
            if (match) {
              value = parseFloat(match[1].replace(/,/g, ''));
            }
          }
          // Handle Stock P/E (just a number)
          else if (key === 'pe') {
            const match = valueLine.match(/([\d,.]+)/);
            if (match) {
              value = parseFloat(match[1].replace(/,/g, ''));
            }
          }
          
          if (value !== null) {
            metrics[key] = value;
          }
          break;
        }
      }
      i++;
    }
    
    return metrics;
  };

  // Update metrics mutation
  const updateMetricsMutation = useMutation({
    mutationFn: async (metrics: Record<string, number | null>) => {
      if (!company?.id) throw new Error("Company ID not available");
      
      // Get current financial data
      const currentFinancialData = (company.financialData as Record<string, any>) || {};
      
      // Merge new metrics with existing data (remove null values)
      const updatedFinancialData: Record<string, any> = { ...currentFinancialData };
      Object.entries(metrics).forEach(([key, value]) => {
        if (value !== null) {
          updatedFinancialData[key] = value;
        } else {
          // Remove null values
          delete updatedFinancialData[key];
        }
      });
      
      // Also update marketCap if it's in the metrics
      const marketCap = metrics.marketCap !== null && metrics.marketCap !== undefined 
        ? metrics.marketCap.toString() 
        : company.marketCap;
      
      const res = await apiRequest("PUT", `/api/companies/${company.id}`, {
        financialData: updatedFinancialData,
        marketCap: marketCap
      });
      return res.json();
    },
    onSuccess: async () => {
      toast({
        title: "Metrics updated successfully",
        description: "Key financial metrics have been updated"
      });
      
      // Invalidate queries to refresh company data
      await queryClient.invalidateQueries({ queryKey: ["/api/companies", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/companies/ticker", companyTicker] });
      await queryClient.refetchQueries({ queryKey: ["/api/companies", company?.id] });
      
      // Close dialog and reset
      setShowMetricsEditorDialog(false);
      setPastedMetricsText("");
      setParsedMetrics({});
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update metrics",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Handle paste and parse metrics
  const handlePasteMetrics = (text: string) => {
    setPastedMetricsText(text);
    const parsed = parseMetricsFromText(text);
    setParsedMetrics(parsed);
  };

  // Pre-populate metrics text when dialog opens
  useEffect(() => {
    if (showMetricsEditorDialog && company) {
      const currentData = company.financialData as Record<string, any> || {};
      const formatText = [
        `Market Cap`,
        currentData.marketCap ? `₹ ${(Number(currentData.marketCap) / 10000000).toFixed(2)} Cr.` : '',
        '',
        `Current Price`,
        currentData.currentPrice ? `₹ ${Number(currentData.currentPrice).toFixed(2)}` : '',
        '',
        `High / Low`,
        currentData.highPrice && currentData.lowPrice 
          ? `₹ ${Number(currentData.highPrice).toFixed(2)} / ${Number(currentData.lowPrice).toFixed(2)}`
          : '',
        '',
        `Stock P/E`,
        currentData.pe ? `${Number(currentData.pe).toFixed(2)}` : '',
        '',
        `Book Value`,
        currentData.bookValue ? `₹ ${Number(currentData.bookValue).toFixed(2)}` : '',
        '',
        `Dividend Yield`,
        currentData.dividendYield ? `${Number(currentData.dividendYield).toFixed(2)} %` : '',
        '',
        `ROCE`,
        currentData.roce ? `${Number(currentData.roce).toFixed(2)} %` : '',
        '',
        `ROE`,
        currentData.roe ? `${Number(currentData.roe).toFixed(2)} %` : '',
        '',
        `Face Value`,
        currentData.faceValue ? `₹ ${Number(currentData.faceValue).toFixed(2)}` : '',
      ].filter(Boolean).join('\n');
      setPastedMetricsText(formatText);
      handlePasteMetrics(formatText);
    } else if (!showMetricsEditorDialog) {
      // Reset when dialog closes
      setPastedMetricsText("");
      setParsedMetrics({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMetricsEditorDialog, company?.id]);

  // Handle update company details
  const handleUpdateCompanyDetails = () => {
    if (!company?.id) return;

    const updates: { ticker?: string; sectorId?: string } = {};
    let needsValidation = false;

    // Check if ticker changed
    if (updateTicker.trim().toUpperCase() !== company.ticker) {
      // If ticker changed, it must be validated first
      if (!updateTickerValidationResult?.valid) {
        toast({
          title: "Please validate ticker first",
          description: "Ticker has changed. Please validate it before updating.",
          variant: "destructive"
        });
        return;
      }
      updates.ticker = updateTicker.trim().toUpperCase();
      needsValidation = true;
    }

    // Check if sector changed
    if (updateSectorId !== (company.sectorId || "")) {
      updates.sectorId = updateSectorId || undefined;
    }

    // If no changes, just close dialog
    if (Object.keys(updates).length === 0) {
      setShowUpdateCompanyDialog(false);
      return;
    }

    // Update company
    updateCompanyDetailsMutation.mutate(updates);
  };

  // Fetch scraping logs for this company
  const { data: scrapingLogs } = useQuery<Array<{
    id: string;
    ticker: string;
    status: string;
    quartersScraped: number;
    metricsScraped: number;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
  }>>({
    queryKey: ["/api/v1/scraping-logs", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const res = await apiRequest("GET", `/api/v1/scraping-logs/${company.id}`);
      return res.json();
    },
    enabled: !!company?.id,
  });

  if (!match || (!companyId && !ticker)) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Invalid company identifier</AlertDescription>
      </Alert>
    );
  }

  if (companyLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (companyError || !company) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load company data. {companyError instanceof Error ? companyError.message : ""}
        </AlertDescription>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/company-manager">Back to Company Manager</Link>
        </Button>
      </Alert>
    );
  }

  const sectorName = sectors?.find(s => s.id === company.sectorId)?.name || "Unknown";
  const financialData = company.financialData as Record<string, number> | null;

  const getFinancialValue = (key: string): number | null => {
    if (!financialData) {
      // Fallback to marketCap from company record
      if (key === "marketCap" && company.marketCap) {
        return parseFloat(company.marketCap);
      }
      return null;
    }
    if (key === "marketCap" && company.marketCap) {
      return parseFloat(company.marketCap);
    }
    const value = financialData[key];
    if (value === undefined || value === null) return null;
    return Number(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start sm:items-center gap-2 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-back"
          className="shrink-0"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold font-mono truncate" data-testid="text-ticker">
                  {company.ticker}
                </h1>
                {latestSignal && <SignalBadge signal={latestSignal.signal as "BUY" | "SELL" | "HOLD"} />}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-sm sm:text-base text-muted-foreground truncate" data-testid="text-company-name">{company.name}</p>
                <Badge variant="outline" data-testid="badge-sector" className="text-xs">{sectorName}</Badge>
                <div className="flex items-center gap-2">
                  <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select
                    value={signalsData?.assignedFormulaId || "default"}
                    onValueChange={(value) => {
                      const formulaId = value === "default" ? null : value;
                      assignFormulaMutation.mutate(formulaId);
                    }}
                    disabled={assignFormulaMutation.isPending}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs border-dashed">
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          {(() => {
                            // Get the assigned formula name from formulas list if assignedFormulaId exists
                            const assignedFormula = signalsData?.assignedFormulaId 
                              ? formulas?.find(f => f.id === signalsData.assignedFormulaId)
                              : null;
                            const displayFormulaName = assignedFormula?.name || signalsData?.effectiveFormula?.name || activeFormulaForPage?.name || "Default";
                            const displayFormulaSource = assignedFormula ? "company" : (signalsData?.formulaSource || "global");
                            return (
                              <>
                                {displayFormulaName}
                                <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                                  {displayFormulaSource === "company" 
                                    ? "Company" 
                                    : displayFormulaSource === "sector" 
                                      ? "Sector" 
                                      : "Global"}
                                </Badge>
                              </>
                            );
                          })()}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default" className="hidden">
                        Use Default (Global/Sector)
                      </SelectItem>
                      {formulas?.filter(f => f.enabled).map((formula) => (
                        <SelectItem key={formula.id} value={formula.id}>
                          {formula.name} ({formula.signal})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignFormulaMutation.isPending && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              {/* Action buttons - positioned under company info on the left */}
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={() => {
                    // Pre-select the company's preferred data source when opening the dialog
                    const preferred = (company?.preferredDataSource as 'consolidated' | 'standalone') || 'consolidated';
                    setSelectedDataType(preferred);
                    setShowFetchDataDialog(true);
                  }}
                  disabled={fetchLatestDataMutation.isPending || !companyTicker}
                  size="sm"
                  variant="outline"
                >
                  {fetchLatestDataMutation.isPending ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Fetching...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Fetch Latest Data</span>
                      <span className="sm:hidden">Fetch</span>
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowUpdateCompanyDialog(true)}
                  size="sm"
                  variant="outline"
                >
                  <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Update Details</span>
                  <span className="sm:hidden">Update</span>
                </Button>
                <Button
                  onClick={() => setShowMetricsEditorDialog(true)}
                  size="sm"
                  variant="outline"
                >
                  <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Edit Metrics</span>
                  <span className="sm:hidden">Metrics</span>
                </Button>
              </div>
            </div>
            {/* Status info - positioned on the right */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              {company?.preferredDataSource && (
                <Badge variant="outline" className="text-xs capitalize">
                  {company.preferredDataSource} Data
                </Badge>
              )}
              {lastScrape && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Last scraped: {formatDate(lastScrape.lastScrape)}</span>
                  <span className="sm:hidden">{formatDate(lastScrape.lastScrape)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Key Financial Metrics (Screener.in style) */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 sm:grid-cols-3">
        {[
          { key: "marketCap", label: "Market Cap", formatter: formatIndianCurrency },
          { key: "currentPrice", label: "Current Price", formatter: (v: number) => `₹${v.toFixed(2)}` },
          {
            key: "highPrice", label: "High / Low", formatter: (v: number) => {
              const low = financialData?.lowPrice as number | undefined;
              return low ? `₹${v.toFixed(2)} / ₹${low.toFixed(2)}` : `₹${v.toFixed(2)}`;
            }
          },
          { key: "pe", label: "Stock P/E", formatter: (v: number) => v.toFixed(2) },
          { key: "bookValue", label: "Book Value", formatter: (v: number) => `₹${v.toFixed(2)}` },
          { key: "dividendYield", label: "Dividend Yield", formatter: (v: number) => `${v.toFixed(2)}%` },
          { key: "roce", label: "ROCE", formatter: (v: number) => `${v.toFixed(2)}%` },
          { key: "roe", label: "ROE", formatter: (v: number) => `${v.toFixed(2)}%` },
          { key: "faceValue", label: "Face Value", formatter: (v: number) => `₹${v.toFixed(2)}` },
        ].map(({ key, label, formatter }) => {
          const value = getFinancialValue(key);
          return (
            <Card key={key} data-testid={`card-${key}`}>
              <CardHeader className="p-2 sm:p-4 pb-1 sm:pb-2">
                <CardDescription className="text-xs">{label}</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold font-mono truncate">
                  {value !== null ? formatter(value) : "—"}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="signals" className="w-full">
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 h-auto">
          <TabsTrigger value="signals" className="text-xs sm:text-sm py-2">
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">Signals</span>
            <span className="sm:hidden">Signals</span>
          </TabsTrigger>
          <TabsTrigger value="quarterly" className="text-xs sm:text-sm py-2">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">Quarterly Data</span>
            <span className="sm:hidden">Quarterly</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm py-2">
            <span className="hidden sm:inline">Signal History</span>
            <span className="sm:hidden">History</span>
          </TabsTrigger>
          <TabsTrigger value="scraping-history" className="text-xs sm:text-sm py-2">
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">Scraping History</span>
            <span className="sm:hidden">Scraping</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Latest Signal</CardTitle>
                    <CardDescription>Most recent signal evaluation</CardDescription>
                  </div>
                  {activeFormula && companyTicker && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTraceModal(true)}
                      disabled={!activeFormula.condition}
                    >
                      <Code2 className="w-4 h-4 mr-2" />
                      View Evaluation
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {signalsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : !latestSignal ? (
                  <p className="text-muted-foreground text-sm">No signals generated yet</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <SignalBadge signal={latestSignal.signal as "BUY" | "SELL" | "HOLD"} />
                      <span className="text-sm text-muted-foreground" data-testid="text-signal-date">
                        {format(new Date(latestSignal.createdAt), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>
                    {latestSignal.value !== null && latestSignal.value !== undefined && (
                      <div className="p-3 bg-muted rounded-md">
                        <p className="text-sm font-medium">Value: {String(latestSignal.value)}</p>
                      </div>
                    )}
                    {!!latestSignal.metadata && typeof latestSignal.metadata === 'object' && (
                      <div className="space-y-2">
                        {/* Display Used Quarters if available - filter to only show quarters actually used in formula */}
                        {'usedQuarters' in latestSignal.metadata && Array.isArray((latestSignal.metadata as any).usedQuarters) && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                              Based on Quarterly Data:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const allUsedQuarters = (latestSignal.metadata as any).usedQuarters as string[];
                                const formulaCondition = ('condition' in latestSignal.metadata) ? String((latestSignal.metadata as any).condition) : '';
                                
                                // Extract quarter indices (Q11, Q12, etc.) from formula condition
                                const quarterIndices = new Set<number>();
                                const matches = formulaCondition.match(/\[Q(\d+)\]/gi);
                                if (matches) {
                                  matches.forEach(match => {
                                    const indexMatch = match.match(/\d+/);
                                    if (indexMatch) {
                                      const quarterIndex = parseInt(indexMatch[0], 10);
                                      quarterIndices.add(quarterIndex);
                                    }
                                  });
                                }
                                
                                // If no quarter indices found in formula, show all quarters (fallback)
                                if (quarterIndices.size === 0) {
                                  return allUsedQuarters.map((q, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200">
                                      {q}
                                    </Badge>
                                  ));
                                }
                                
                                // usedQuarters is sorted newest first (Q12 = index 0, Q11 = index 1, Q1 = index 11)
                                // So to get Q12, we use index 0; to get Q11, we use index 1, etc.
                                // General: Qn is at array index (totalQuarters - n)
                                const filteredQuarters = Array.from(quarterIndices)
                                  .map(qIndex => {
                                    // Q12 (when totalQuarters=12) -> index 12-12 = 0 (newest)
                                    // Q11 (when totalQuarters=12) -> index 12-11 = 1 (second newest)
                                    // Q1 (when totalQuarters=12) -> index 12-1 = 11 (oldest)
                                    const arrayIndex = allUsedQuarters.length - qIndex;
                                    if (arrayIndex >= 0 && arrayIndex < allUsedQuarters.length) {
                                      return allUsedQuarters[arrayIndex];
                                    }
                                    return null;
                                  })
                                  .filter(Boolean) as string[];
                                
                                // Sort filtered quarters to maintain newest-first order for display
                                const displayQuarters = filteredQuarters.length > 0 
                                  ? filteredQuarters.sort((a, b) => {
                                      // Sort by date (newest first) to match the original order
                                      const dateA = new Date(a);
                                      const dateB = new Date(b);
                                      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                                        return dateB.getTime() - dateA.getTime();
                                      }
                                      return b.localeCompare(a);
                                    })
                                  : allUsedQuarters; // Fallback to all if extraction failed
                                
                                return displayQuarters.map((q, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200">
                                    {q}
                                  </Badge>
                                ));
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Display Formula Name/Condition if available */}
                        {('formulaName' in latestSignal.metadata || 'condition' in latestSignal.metadata) && (
                          <div className="p-3 bg-muted rounded-md text-xs">
                            <p className="font-medium mb-1">Formula Details:</p>
                            {'formulaName' in latestSignal.metadata && (
                              <p><span className="text-muted-foreground">Name:</span> {String((latestSignal.metadata as any).formulaName)}</p>
                            )}
                            {'condition' in latestSignal.metadata && (
                              <p className="font-mono mt-1"><span className="text-muted-foreground">Condition:</span> {String((latestSignal.metadata as any).condition)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {signalsSummary && (
              <Card>
                <CardHeader>
                  <CardTitle>Signal Summary</CardTitle>
                  <CardDescription>Overall signal distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Signals</span>
                      <Badge variant="outline">{signalsSummary.total}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600">Buy</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        {signalsSummary.buy}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-red-600">Sell</span>
                      <Badge variant="outline" className="bg-red-50 text-red-700">
                        {signalsSummary.sell}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-yellow-600">Hold</span>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                        {signalsSummary.hold}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="quarterly" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Quarterly Financial Data</CardTitle>
                  <CardDescription>Historical quarterly metrics with formula analysis</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (company?.id) {
                        window.location.href = `/formula-builder?type=company&id=${company.id}`;
                      }
                    }}
                  >
                    <Calculator className="h-4 w-4 mr-2" />
                    Build Formula
                  </Button>


                  {/* Ticker Update Dialog */}
                  <Dialog open={showTickerUpdateDialog} onOpenChange={(open) => {
                    if (!open && !updateTickerMutation.isPending) {
                      setShowTickerUpdateDialog(false);
                      setTickerValidationResult(null);
                      setNewTicker("");
                    }
                  }}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Update Ticker and Retry</DialogTitle>
                        <DialogDescription>
                          The current ticker may be incorrect or the company may not exist on Screener.in.
                          Please enter the correct ticker to fetch data.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-ticker">New Ticker</Label>
                          <Input
                            id="new-ticker"
                            value={newTicker}
                            onChange={(e) => {
                              setNewTicker(e.target.value.toUpperCase());
                              setTickerValidationResult(null); // Clear validation when user types
                            }}
                            placeholder="Enter ticker (e.g., TCS)"
                            className="font-mono"
                          />
                          <p className="text-xs text-muted-foreground">
                            Current ticker: <span className="font-mono font-semibold">{companyTicker}</span>
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={handleValidateTicker}
                            disabled={!newTicker.trim() || isValidatingTicker || newTicker.toUpperCase() === companyTicker}
                            variant="outline"
                            className="flex-1"
                          >
                            {isValidatingTicker ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Validating...
                              </>
                            ) : (
                              "Validate Ticker"
                            )}
                          </Button>
                        </div>

                        {tickerValidationResult && (
                          <div className={`p-3 rounded-md ${tickerValidationResult.valid
                            ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                            : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                            }`}>
                            {tickerValidationResult.valid ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                <div>
                                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                                    Ticker is valid
                                  </p>
                                  {tickerValidationResult.companyName && (
                                    <p className="text-xs text-green-700 dark:text-green-300">
                                      Company: {tickerValidationResult.companyName}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <div>
                                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                                    Ticker is invalid
                                  </p>
                                  {tickerValidationResult.error && (
                                    <p className="text-xs text-red-700 dark:text-red-300">
                                      {tickerValidationResult.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowTickerUpdateDialog(false);
                              setTickerValidationResult(null);
                              setNewTicker("");
                            }}
                            disabled={updateTickerMutation.isPending}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleUpdateTickerAndRetry}
                            disabled={!tickerValidationResult?.valid || updateTickerMutation.isPending || newTicker.toUpperCase() === companyTicker}
                            className="flex-1"
                          >
                            {updateTickerMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              "Update Ticker & Retry"
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Ticker Update Dialog */}
                  <Dialog open={showTickerUpdateDialog} onOpenChange={(open) => {
                    if (!open && !updateTickerMutation.isPending) {
                      setShowTickerUpdateDialog(false);
                      setTickerValidationResult(null);
                      setNewTicker("");
                    }
                  }}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Update Ticker and Retry</DialogTitle>
                        <DialogDescription>
                          The current ticker may be incorrect or the company may not exist on Screener.in.
                          Please enter the correct ticker to fetch data.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-ticker">New Ticker</Label>
                          <Input
                            id="new-ticker"
                            value={newTicker}
                            onChange={(e) => {
                              setNewTicker(e.target.value.toUpperCase());
                              setTickerValidationResult(null); // Clear validation when user types
                            }}
                            placeholder="Enter ticker (e.g., TCS)"
                            className="font-mono"
                          />
                          <p className="text-xs text-muted-foreground">
                            Current ticker: <span className="font-mono font-semibold">{companyTicker}</span>
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={handleValidateTicker}
                            disabled={!newTicker.trim() || isValidatingTicker || newTicker.toUpperCase() === companyTicker}
                            variant="outline"
                            className="flex-1"
                          >
                            {isValidatingTicker ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Validating...
                              </>
                            ) : (
                              "Validate Ticker"
                            )}
                          </Button>
                        </div>

                        {tickerValidationResult && (
                          <div className={`p-3 rounded-md ${tickerValidationResult.valid
                            ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                            : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                            }`}>
                            {tickerValidationResult.valid ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                <div>
                                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                                    Ticker is valid
                                  </p>
                                  {tickerValidationResult.companyName && (
                                    <p className="text-xs text-green-700 dark:text-green-300">
                                      Company: {tickerValidationResult.companyName}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <div>
                                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                                    Ticker is invalid
                                  </p>
                                  {tickerValidationResult.error && (
                                    <p className="text-xs text-red-700 dark:text-red-300">
                                      {tickerValidationResult.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowTickerUpdateDialog(false);
                              setTickerValidationResult(null);
                              setNewTicker("");
                            }}
                            disabled={updateTickerMutation.isPending}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleUpdateTickerAndRetry}
                            disabled={!tickerValidationResult?.valid || updateTickerMutation.isPending || newTicker.toUpperCase() === companyTicker}
                            className="flex-1"
                          >
                            {updateTickerMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              "Update Ticker & Retry"
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {quarterlyLoading ? (
                <div className="p-6 space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !sortedQuarterlyData || sortedQuarterlyData.quarters.length === 0 ? (
                <div className="p-6">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No quarterly data available. Data will appear here once scraping is performed.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {/* Formula Bar */}
                  {showFormulaBar && (
                    <Card className="border-2 border-blue-200 dark:border-blue-800">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calculator className="h-4 w-4 text-blue-600" />
                            <span className="font-semibold">Apply Formula to Selected Quarters</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowFormulaBar(false)}
                          >
                            ×
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label>Selected Quarters: {selectedQuartersForFormula.size > 0 ? Array.from(selectedQuartersForFormula).join(", ") : "None"}</Label>
                          <div className="flex gap-2">
                            <Select
                              value={selectedFormulaId || "default"}
                              onValueChange={(value) => {
                                if (value === "default") {
                                  setSelectedFormulaId("");
                                  setUseCustomFormula(true);
                                } else {
                                  setSelectedFormulaId(value);
                                  setUseCustomFormula(false);
                                  
                                  // Debounce signal recalculation when formula selection changes
                                  // Clear any pending debounce
                                  if (formulaDropdownDebounceRef.current) {
                                    clearTimeout(formulaDropdownDebounceRef.current);
                                  }
                                  
                                  // Set new debounced calculation (500ms delay)
                                  formulaDropdownDebounceRef.current = setTimeout(async () => {
                                    if (company?.id) {
                                      try {
                                        const response = await apiRequest("POST", "/api/signals/calculate", {
                                          companyIds: [company.id],
                                          incremental: false,
                                          async: true // Use async mode to avoid blocking
                                        });
                                        const data = await response.json();
                                        
                                        if (data.jobId) {
                                          toast({
                                            title: "Recalculating signals",
                                            description: "Signals are being recalculated with the new formula.",
                                          });
                                        }
                                        
                                        // Refresh signals after a delay
                                        setTimeout(() => {
                                          queryClient.invalidateQueries({ queryKey: ["/api/v1/companies", company.id || companyTicker, "signals"] });
                                          queryClient.refetchQueries({ queryKey: ["/api/v1/companies", company.id || companyTicker, "signals"] });
                                        }, 2000);
                                      } catch (error) {
                                        toast({
                                          title: "Failed to recalculate signals",
                                          description: error instanceof Error ? error.message : "An error occurred",
                                          variant: "destructive"
                                        });
                                        console.error("Error calculating signals after formula change:", error);
                                      }
                                    }
                                  }, 500); // 500ms debounce delay
                                }
                              }}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select a formula" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Use Custom Formula</SelectItem>
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

                                if (!formulaToUse) {
                                  toast({
                                    title: "No formula",
                                    description: "Please select or enter a formula",
                                    variant: "destructive"
                                  });
                                  return;
                                }

                                try {
                                  // Test the formula with the selected quarters
                                  const res = await apiRequest("POST", "/api/v1/formulas/test-excel", {
                                    ticker: company?.ticker || ticker,
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

                                  setFormulaResultForSelected(String(actualResult));
                                  toast({
                                    title: "Formula evaluated",
                                    description: `Result: ${actualResult} (${actualType})`
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Evaluation failed",
                                    description: (error as Error).message,
                                    variant: "destructive"
                                  });
                                }
                              }}
                              disabled={selectedQuartersForFormula.size === 0}
                            >
                              <Calculator className="h-4 w-4 mr-2" />
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

                                const name = prompt("Enter a name for this company-specific formula:", `Custom Formula for ${ticker}`);
                                if (!name) return;

                                try {
                                  await apiRequest("POST", "/api/formulas", {
                                    name,
                                    scope: "company",
                                    scopeValue: company?.id, // Auto-filled from current company
                                    condition: formulaToSave,
                                    signal: customFormulaSignal,
                                    priority: 1,
                                    enabled: true
                                  });

                                  toast({
                                    title: "Formula Saved",
                                    description: "This formula will now be used for this company.",
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
                              <FormulaEditor
                                value={customFormula}
                                onChange={(val) => setCustomFormula(val)}
                                textareaRef={formulaInputRef}
                                placeholder='IF(AND(SalesGrowth[Q1]>0, EPS[Q1]>10), "BUY", "HOLD")'
                                height="min-h-24"
                              />
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="use-custom-formula-bar"
                                  checked={useCustomFormula}
                                  onCheckedChange={(checked) => setUseCustomFormula(checked as boolean)}
                                />
                                <Label htmlFor="use-custom-formula-bar" className="text-sm cursor-pointer">
                                  Use custom formula
                                </Label>
                              </div>
                            </div>
                          ) : null}
                          {formulaResultForSelected && (
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded">
                              <div className="text-sm font-medium mb-1">Result:</div>
                              <div className="font-mono text-lg">
                                <SignalBadge signal={formulaResultForSelected as "BUY" | "SELL" | "HOLD" | "Check_OPM (Sell)" | "No Signal"} />
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <QuarterlyDataSpreadsheet
                    data={{
                      sectorId: company?.sectorId || "",
                      quarters: filteredQuarters.map(q => q.quarter),
                      metrics: filteredMetrics,
                      companies: [{
                        ticker: company?.ticker || ticker || "",
                        companyId: company?.id || null,
                        companyName: company?.name || ticker || "",
                        quarters: filteredQuarters.reduce((acc, q) => {
                          acc[q.quarter] = q.metrics;
                          return acc;
                        }, {} as Record<string, Record<string, string | null>>)
                      }]
                    }}
                    selectedMetrics={filteredMetrics}
                    selectedQuarters={filteredQuarters.map(q => q.quarter)}
                    onCellSelect={handleCellSelect}
                    selectedCells={new Set()}
                    formulaResults={{ result: { result: formulaResultForSelected || formulaResult || "—", type: "string" } }}
                    mode="company"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Signal History</CardTitle>
              <CardDescription>
                {sortedSignals.length > 0 ? `${sortedSignals.length} signal${sortedSignals.length !== 1 ? 's' : ''}` : "No history"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signalsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : sortedSignals.length === 0 ? (
                <p className="text-muted-foreground text-sm">No signal history available</p>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-3">
                    {sortedSignals.map((signal, index) => (
                      <div
                        key={signal.id}
                        className="p-3 border rounded-lg hover-elevate"
                        data-testid={`signal-history-${index}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <SignalBadge signal={signal.signal as "BUY" | "SELL" | "HOLD"} />
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(signal.createdAt), "MMM d, yyyy HH:mm")}
                          </span>
                        </div>
                        {signal.value && (
                          <p className="text-sm text-muted-foreground">Value: {String(signal.value)}</p>
                        )}
                        {(signal as any).formula && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Formula: {(signal as any).formula.name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scraping-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scraping History</CardTitle>
              <CardDescription>View scraping logs and history for this company</CardDescription>
            </CardHeader>
            <CardContent>
              {!scrapingLogs || scrapingLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No scraping history available. Scrape this company to see logs.
                </div>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date/Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Quarters</TableHead>
                        <TableHead>Metrics</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scrapingLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-medium">
                                {formatDate(log.startedAt)}
                              </div>
                              {log.completedAt && (
                                <div className="text-xs text-muted-foreground">
                                  Completed: {formatDate(log.completedAt)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.status === 'success' ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>Success</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-600">
                                <XCircle className="h-4 w-4" />
                                <span>Failed</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{log.quartersScraped}</TableCell>
                          <TableCell>{log.metricsScraped}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {log.error || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {
        !financialData && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No financial data available for this company. Update the company in the Company Manager to add financial metrics.
            </AlertDescription>
          </Alert>
        )
      }

      {/* Formula Evaluation Trace Modal */}
      {activeFormula && companyTicker && (
        <FormulaEvaluationTrace
          ticker={companyTicker}
          formula={activeFormula.condition}
          selectedQuarters={filteredQuarters.map(q => q.quarter)}
          open={showTraceModal}
          onOpenChange={setShowTraceModal}
        />
      )}

      {/* Update Company Details Dialog - Placed at component level so it works from any tab */}
      <Dialog open={showUpdateCompanyDialog} onOpenChange={(open) => {
        if (!open && !updateCompanyDetailsMutation.isPending) {
          setShowUpdateCompanyDialog(false);
          setUpdateTickerValidationResult(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Company Details</DialogTitle>
            <DialogDescription>
              Update the company ticker and/or sector. If ticker is changed, latest data will be fetched automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="update-ticker">Ticker</Label>
              <div className="flex gap-2">
                <Input
                  id="update-ticker"
                  value={updateTicker}
                  onChange={(e) => {
                    setUpdateTicker(e.target.value.toUpperCase());
                    setUpdateTickerValidationResult(null); // Clear validation when user types
                  }}
                  placeholder="Enter ticker (e.g., TCS)"
                  className="font-mono flex-1"
                />
                <Button
                  onClick={handleValidateUpdateTicker}
                  disabled={!updateTicker.trim() || isValidatingUpdateTicker}
                  variant="outline"
                  size="sm"
                >
                  {isValidatingUpdateTicker ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating
                    </>
                  ) : (
                    "Validate"
                  )}
                </Button>
              </div>
              {updateTickerValidationResult && (
                <div className={`p-2 rounded-md text-xs ${updateTickerValidationResult.valid
                  ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                  }`}>
                  {updateTickerValidationResult.valid ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                      <span className="text-green-900 dark:text-green-100">
                        Valid: {updateTickerValidationResult.companyName}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                      <span className="text-red-900 dark:text-red-100">
                        {updateTickerValidationResult.error}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="update-sector">Sector</Label>
              <Select
                value={updateSectorId || undefined}
                onValueChange={(value) => setUpdateSectorId(value === "none" ? "" : value)}
              >
                <SelectTrigger id="update-sector">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {sectors?.map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUpdateCompanyDialog(false);
                  setUpdateTickerValidationResult(null);
                }}
                disabled={updateCompanyDetailsMutation.isPending}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateCompanyDetails}
                disabled={
                  updateCompanyDetailsMutation.isPending ||
                  (updateTicker.trim().toUpperCase() !== company?.ticker && !updateTickerValidationResult?.valid)
                }
                className="flex-1"
              >
                {updateCompanyDetailsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Company"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Metrics Editor Dialog - Placed at component level so it works from any tab */}
      <Dialog open={showMetricsEditorDialog} onOpenChange={(open) => {
        if (!open && !updateMetricsMutation.isPending) {
          setShowMetricsEditorDialog(false);
          setPastedMetricsText("");
          setParsedMetrics({});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Key Financial Metrics</DialogTitle>
            <DialogDescription>
              Paste the metrics from Screener.in or edit them manually. The format should be:
              <br />
              <code className="text-xs bg-muted p-1 rounded">
                Market Cap<br />
                ₹ 976 Cr.<br />
                Current Price<br />
                ₹ 24.7<br />
                ...
              </code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="metrics-text">Metrics (paste or edit)</Label>
              <Textarea
                id="metrics-text"
                value={pastedMetricsText}
                onChange={(e) => handlePasteMetrics(e.target.value)}
                placeholder="Market Cap&#10;₹ 976 Cr.&#10;&#10;Current Price&#10;₹ 24.7&#10;&#10;High / Low&#10;₹ 33.5 / 22.0&#10;&#10;Stock P/E&#10;11.6&#10;&#10;Book Value&#10;₹ 35.9&#10;&#10;Dividend Yield&#10;0.00 %&#10;&#10;ROCE&#10;5.47 %&#10;&#10;ROE&#10;5.48 %&#10;&#10;Face Value&#10;₹ 10.0"
                className="font-mono text-sm min-h-[300px]"
              />
            </div>

            {/* Show parsed metrics preview */}
            {Object.keys(parsedMetrics).length > 0 && (
              <div className="space-y-2">
                <Label>Parsed Metrics Preview</Label>
                <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                  {Object.entries(parsedMetrics).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className="font-mono">
                        {value !== null ? (
                          key === 'marketCap' ? formatIndianCurrency(value) :
                          key === 'currentPrice' || key === 'bookValue' || key === 'faceValue' ? `₹${value.toFixed(2)}` :
                          key === 'highPrice' || key === 'lowPrice' ? `₹${value.toFixed(2)}` :
                          key === 'pe' ? value.toFixed(2) :
                          `${value.toFixed(2)}%`
                        ) : (
                          <span className="text-muted-foreground">Not found</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowMetricsEditorDialog(false);
                  setPastedMetricsText("");
                  setParsedMetrics({});
                }}
                disabled={updateMetricsMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (Object.keys(parsedMetrics).length === 0) {
                    toast({
                      title: "No metrics found",
                      description: "Please paste metrics in the correct format",
                      variant: "destructive"
                    });
                    return;
                  }
                  updateMetricsMutation.mutate(parsedMetrics);
                }}
                disabled={updateMetricsMutation.isPending || Object.keys(parsedMetrics).length === 0}
                className="flex-1"
              >
                {updateMetricsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Metrics"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fetch Data Type Dialog */}
      <Dialog open={showFetchDataDialog} onOpenChange={(open) => {
        if (!open && !fetchLatestDataMutation.isPending) {
          setShowFetchDataDialog(false);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fetch Latest Data</DialogTitle>
            <DialogDescription>
              Choose which data source to fetch from Screener.in
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {company?.preferredDataSource && (
              <Alert className="bg-muted/50">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Current preference: <strong className="capitalize">{company.preferredDataSource}</strong>. 
                  This will be remembered for future sector scrapes.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Data Source</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={selectedDataType === 'consolidated' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setSelectedDataType('consolidated')}
                  disabled={fetchLatestDataMutation.isPending}
                >
                  Consolidated
                  {company?.preferredDataSource === 'consolidated' && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1">Current</Badge>
                  )}
                </Button>
                <Button
                  variant={selectedDataType === 'standalone' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setSelectedDataType('standalone')}
                  disabled={fetchLatestDataMutation.isPending}
                >
                  Standalone
                  {company?.preferredDataSource === 'standalone' && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1">Current</Badge>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedDataType === 'consolidated' 
                  ? 'Consolidated data includes subsidiaries and group companies.'
                  : 'Standalone data shows only the parent company\'s financials.'}
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                If no data is found from the selected source, the database will <strong>NOT</strong> be updated. 
                You'll be notified and can try the other source.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFetchDataDialog(false)}
                disabled={fetchLatestDataMutation.isPending}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => fetchLatestDataMutation.mutate(selectedDataType)}
                disabled={fetchLatestDataMutation.isPending}
                className="flex-1"
              >
                {fetchLatestDataMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Fetch Data
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
