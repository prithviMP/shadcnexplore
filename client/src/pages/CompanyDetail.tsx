import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CheckCircle2, XCircle, Settings, Calculator, CheckSquare, Square, RefreshCw, Loader2, Edit } from "lucide-react";
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
import { ArrowLeft, AlertCircle, TrendingUp, BarChart3 } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Company, Sector, Signal, Formula } from "@shared/schema";
import { format } from "date-fns";
import { evaluateQuarterlyFormula } from "@/utils/quarterlyFormulaEvaluator";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { sortQuarters, formatQuarterWithLabel } from "@/utils/quarterUtils";

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
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [selectedQuarters, setSelectedQuarters] = useState<Set<string>>(new Set());
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>("");
  const [customFormula, setCustomFormula] = useState<string>("");
  const [customFormulaSignal, setCustomFormulaSignal] = useState<string>("BUY");
  const [useCustomFormula, setUseCustomFormula] = useState(false);
  const [showAnalysisSettings, setShowAnalysisSettings] = useState(false);
  const [selectedQuartersForFormula, setSelectedQuartersForFormula] = useState<Set<string>>(new Set());
  const [formulaResultForSelected, setFormulaResultForSelected] = useState<string | null>(null);
  const [showFormulaBar, setShowFormulaBar] = useState(false);
  
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

  // Fetch signals using new endpoint - use ticker from company or params
  const { data: signalsData, isLoading: signalsLoading } = useQuery<{
    ticker: string;
    companyId: string;
    signals: Array<Signal & { formula?: any }>;
    summary: {
      total: number;
      buy: number;
      sell: number;
      hold: number;
    };
  }>({
    queryKey: ["/api/v1/companies", companyTicker, "signals"],
    enabled: !!companyTicker
  });

  const signals = signalsData?.signals || [];
  const signalsSummary = signalsData?.summary;

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

  // Get available metrics from quarterly data
  const availableMetrics = useMemo(() => {
    if (!sortedQuarterlyData || sortedQuarterlyData.quarters.length === 0) return [];
    return Object.keys(sortedQuarterlyData.quarters[0].metrics);
  }, [sortedQuarterlyData]);

  // Fetch default metrics from settings
  const { data: defaultMetricsData } = useQuery<{
    metrics: Record<string, boolean>;
    visibleMetrics: string[];
  }>({
    queryKey: ["/api/settings/default-metrics"],
    retry: 1, // Retry once if it fails
  });

  // Initialize selected metrics to default metrics from settings if empty
  useEffect(() => {
    if (availableMetrics.length > 0 && selectedMetrics.size === 0) {
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
        availableMetrics.includes(metricName)
      );

      if (matchedMetrics.length > 0) {
        setSelectedMetrics(new Set(matchedMetrics));
      } else {
        // If default metrics not found, use first 6 metrics
        setSelectedMetrics(new Set(availableMetrics.slice(0, 6)));
      }
    }
  }, [availableMetrics, selectedMetrics.size, defaultMetricsData]);

  // Initialize selected quarters to last 12 quarters if empty
  useEffect(() => {
    if (sortedQuarterlyData && sortedQuarterlyData.quarters.length > 0 && selectedQuarters.size === 0) {
      // Default to last 12 quarters (most recent)
      const quartersToSelect = sortedQuarterlyData.quarters.length > 12
        ? sortedQuarterlyData.quarters.slice(-12)
        : sortedQuarterlyData.quarters;
      setSelectedQuarters(new Set(quartersToSelect.map(q => q.quarter)));
    }
  }, [sortedQuarterlyData, selectedQuarters.size]);

  // Auto-select last 12 quarters for formula evaluation when data loads
  useEffect(() => {
    if (sortedQuarterlyData && sortedQuarterlyData.quarters.length > 0 && selectedQuartersForFormula.size === 0) {
      const quartersForFormula = sortedQuarterlyData.quarters.length > 12
        ? sortedQuarterlyData.quarters.slice(-12)
        : sortedQuarterlyData.quarters;
      setSelectedQuartersForFormula(new Set(quartersForFormula.map(q => q.quarter)));
    }
  }, [sortedQuarterlyData, selectedQuartersForFormula.size]);

  // Filter metrics and quarters based on selection
  const filteredMetrics = useMemo(() => {
    if (selectedMetrics.size === 0) return availableMetrics;
    return availableMetrics.filter(m => selectedMetrics.has(m));
  }, [availableMetrics, selectedMetrics]);

  const filteredQuarters = useMemo(() => {
    if (!sortedQuarterlyData) return [];
    if (selectedQuarters.size === 0) {
      // Default to all available quarters (up to 12) if nothing selected
      return sortedQuarterlyData.quarters.slice(0, Math.min(12, sortedQuarterlyData.quarters.length));
    }
    return sortedQuarterlyData.quarters.filter(q => selectedQuarters.has(q.quarter));
  }, [sortedQuarterlyData, selectedQuarters]);

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

  // Evaluate formula once for the entire table
  // The formula uses selected quarters and can reference multiple metrics
  // Always show signal column if we have quarterly data (even without explicit formula selection)
  const formulaResult = useMemo(() => {
    if (!sortedQuarterlyData || filteredQuarters.length === 0) {
      return "HOLD";
    }

    // If no formula is available, default to HOLD
    if (!activeFormula) {
      return "HOLD";
    }

    const selectedQuarterNames = filteredQuarters.map(q => q.quarter);
    const availableMetrics = sortedQuarterlyData.quarters[0] ? Object.keys(sortedQuarterlyData.quarters[0].metrics) : [];

    // Evaluate the formula once using selected quarters
    const signal = evaluateQuarterlyFormula(
      sortedQuarterlyData,
      selectedQuarterNames,
      activeFormula,
      availableMetrics
    );

    // Default to HOLD if no signal matches
    return signal || "HOLD";
  }, [activeFormula, sortedQuarterlyData, filteredQuarters]);

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

  // Mutation for fetching latest data
  const fetchLatestDataMutation = useMutation({
    mutationFn: async () => {
      if (!companyTicker) throw new Error("No ticker available");
      const res = await apiRequest("POST", "/api/v1/scraper/scrape/single", { 
        ticker: companyTicker,
        sectorId: company?.sectorId 
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
      // Check if fetch failed
      if (data.success === false) {
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
      toast({
        title: "Data fetched successfully",
        description: `Scraped ${data.quartersScraped || 0} quarters and ${data.metricsScraped || 0} metrics`
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
      updates.sectorId = updateSectorId || null;
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
  const sortedSignals = signals ? [...signals].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ) : [];
  const latestSignal = sortedSignals[0];
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
        <Link href="/company-manager">
          <Button variant="ghost" size="icon" data-testid="button-back" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold font-mono truncate" data-testid="text-ticker">
                  {company.ticker}
                </h1>
                {latestSignal && <SignalBadge signal={latestSignal.signal as "BUY" | "SELL" | "HOLD"} />}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-sm sm:text-base text-muted-foreground truncate" data-testid="text-company-name">{company.name}</p>
                <Badge variant="outline" data-testid="badge-sector" className="text-xs">{sectorName}</Badge>
              </div>
            </div>
            {lastScrape && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Last scraped: {formatDate(lastScrape.lastScrape)}</span>
                  <span className="sm:hidden">{formatDate(lastScrape.lastScrape)}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={() => fetchLatestDataMutation.mutate()}
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
                </div>
              </div>
            )}
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
                <CardTitle>Latest Signal</CardTitle>
                <CardDescription>Most recent signal evaluation</CardDescription>
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
                        {/* Display Used Quarters if available */}
                        {'usedQuarters' in latestSignal.metadata && Array.isArray((latestSignal.metadata as any).usedQuarters) && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                              Based on Quarterly Data:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {((latestSignal.metadata as any).usedQuarters as string[]).map((q, i) => (
                                <Badge key={i} variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200">
                                  {q}
                                </Badge>
                              ))}
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
                  <Dialog open={showAnalysisSettings} onOpenChange={setShowAnalysisSettings}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Analysis Settings
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Analysis Settings</DialogTitle>
                      <DialogDescription>
                        Select metrics to display, choose quarters to analyze, and apply formulas
                      </DialogDescription>
                    </DialogHeader>
                    <SettingsTabs defaultValue="metrics" className="w-full">
                      <SettingsTabsList className="grid w-full grid-cols-3">
                        <SettingsTabsTrigger value="metrics">Metrics (Rows)</SettingsTabsTrigger>
                        <SettingsTabsTrigger value="quarters">Quarters (Columns)</SettingsTabsTrigger>
                        <SettingsTabsTrigger value="formula">Formula</SettingsTabsTrigger>
                      </SettingsTabsList>

                      <SettingsTabsContent value="metrics" className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Select Metrics to Display</Label>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedMetrics(new Set(availableMetrics))}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedMetrics(new Set())}
                              >
                                Deselect All
                              </Button>
                            </div>
                          </div>
                          <ScrollArea className="h-[300px] border rounded-md p-4">
                            <div className="space-y-2">
                              {availableMetrics.map((metric) => (
                                <div key={metric} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`metric-${metric}`}
                                    checked={selectedMetrics.has(metric)}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedMetrics);
                                      if (checked) {
                                        newSet.add(metric);
                                      } else {
                                        newSet.delete(metric);
                                      }
                                      setSelectedMetrics(newSet);
                                    }}
                                  />
                                  <Label
                                    htmlFor={`metric-${metric}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {metric.replace(/([A-Z])/g, ' $1').trim()}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </SettingsTabsContent>

                      <SettingsTabsContent value="quarters" className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Select Quarters to Analyze</Label>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (sortedQuarterlyData) {
                                    setSelectedQuarters(new Set(sortedQuarterlyData.quarters.map(q => q.quarter)));
                                  }
                                }}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedQuarters(new Set())}
                              >
                                Deselect All
                              </Button>
                            </div>
                          </div>
                          <ScrollArea className="h-[300px] border rounded-md p-4">
                            <div className="space-y-2">
                              {sortedQuarterlyData?.quarters.map((quarter) => (
                                <div key={quarter.quarter} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`quarter-${quarter.quarter}`}
                                    checked={selectedQuarters.has(quarter.quarter)}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedQuarters);
                                      if (checked) {
                                        newSet.add(quarter.quarter);
                                      } else {
                                        newSet.delete(quarter.quarter);
                                      }
                                      setSelectedQuarters(newSet);
                                    }}
                                  />
                                  <Label
                                    htmlFor={`quarter-${quarter.quarter}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {formatQuarterWithLabel(quarter.quarter)}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          <p className="text-xs text-muted-foreground">
                            If no quarters selected, all available quarters (up to 12) will be used by default.
                          </p>
                        </div>
                      </SettingsTabsContent>

                      <SettingsTabsContent value="formula" className="space-y-4">
                        <div className="space-y-3">
                          <Label>Formula Selection</Label>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="use-custom-formula"
                                checked={useCustomFormula}
                                onCheckedChange={(checked) => setUseCustomFormula(checked === true)}
                              />
                              <Label htmlFor="use-custom-formula" className="text-sm font-normal cursor-pointer">
                                Use custom formula
                              </Label>
                            </div>
                            {useCustomFormula ? (
                              <div className="space-y-2">
                                <div>
                                  <Label htmlFor="custom-formula-condition">Formula Condition</Label>
                                  <Input
                                    id="custom-formula-condition"
                                    placeholder="e.g., Sales > 100000 AND EPS > 10"
                                    value={customFormula}
                                    onChange={(e) => setCustomFormula(e.target.value)}
                                    className="mt-1"
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Use metric names from quarterly data (e.g., Sales, EPS, Operating Profit).
                                    Operators: &gt;, &lt;, &gt;=, &lt;=, =, !=. Use AND/OR for multiple conditions.
                                  </p>
                                </div>
                                <div>
                                  <Label htmlFor="custom-formula-signal">Signal Type</Label>
                                  <Select value={customFormulaSignal} onValueChange={setCustomFormulaSignal}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="BUY">BUY</SelectItem>
                                      <SelectItem value="SELL">SELL</SelectItem>
                                      <SelectItem value="HOLD">HOLD</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <Label htmlFor="formula-select">Select Formula</Label>
                                <Select value={selectedFormulaId || "default"} onValueChange={(value) => {
                                  if (value === "default") {
                                    setSelectedFormulaId("");
                                  } else {
                                    setSelectedFormulaId(value);
                                  }
                                }}>
                                  <SelectTrigger className="mt-1">
                                    <SelectValue placeholder={globalFormula ? `Using: ${globalFormula.name} (Global)` : "Select a formula"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="default">{globalFormula ? `Default: ${globalFormula.name} (Global)` : "None (No formula)"}</SelectItem>
                                    {formulas?.filter(f => f.enabled).map((formula) => (
                                      <SelectItem key={formula.id} value={formula.id}>
                                        {formula.name} ({formula.signal}) - {formula.condition}
                                        {formula.scope === "global" && " [Global]"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {globalFormula
                                    ? `Default: Global formula "${globalFormula.name}" is used automatically. Select another formula to override.`
                                    : "Formulas from database. Note: Only formulas referencing quarterly metrics will work."}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </SettingsTabsContent>
                    </SettingsTabs>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setShowAnalysisSettings(false)}>
                        Close
                      </Button>
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
                        <div className={`p-3 rounded-md ${
                          tickerValidationResult.valid 
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
                        <div className={`p-3 rounded-md ${
                          tickerValidationResult.valid 
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
                
                {/* Update Company Details Dialog */}
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
                          <div className={`p-2 rounded-md text-xs ${
                            updateTickerValidationResult.valid 
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
                              <Textarea
                                value={customFormula}
                                onChange={(e) => setCustomFormula(e.target.value)}
                                placeholder='IF(AND(Q14>0, P14>0, Q12>=20%, Q15>=20%, ...), "BUY", ...)'
                                className="font-mono text-sm min-h-24"
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

                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-background z-30 min-w-[200px] whitespace-nowrap border-r border-border">
                            <div className="flex items-center gap-2">
                              <span>Metric</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => setShowFormulaBar(!showFormulaBar)}
                                title="Show formula bar"
                              >
                                <Calculator className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableHead>
                          {filteredQuarters.map((quarter) => (
                            <TableHead key={quarter.quarter} className="text-right min-w-[120px] whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <Checkbox
                                  checked={selectedQuartersForFormula.has(quarter.quarter)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedQuartersForFormula);
                                    if (checked) {
                                      newSet.add(quarter.quarter);
                                    } else {
                                      newSet.delete(quarter.quarter);
                                    }
                                    setSelectedQuartersForFormula(newSet);
                                    if (newSet.size > 0 && !showFormulaBar) {
                                      setShowFormulaBar(true);
                                    }
                                  }}
                                  className="h-4 w-4"
                                />
                                <span>{formatQuarterWithLabel(quarter.quarter)}</span>
                              </div>
                            </TableHead>
                          ))}
                          {showSignalColumn && (
                            <TableHead className="text-center min-w-[100px] sticky right-0 bg-background z-30 whitespace-nowrap border-l border-border font-semibold">
                              Signal
                              {activeFormula && (
                                <span className="block text-xs text-muted-foreground font-normal">
                                  ({activeFormula.id === "custom" ? "Custom" : activeFormula.name || "Main Signal Formula"})
                                </span>
                              )}
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMetrics.map((metric) => {
                          // Get all values for this metric across filtered quarters
                          const metricValues = filteredQuarters.map(q => q.metrics[metric]);

                          return (
                            <TableRow key={metric}>
                              <TableCell className="font-medium sticky left-0 bg-background z-20 whitespace-nowrap border-r border-border">
                                {metric.replace(/([A-Z])/g, ' $1').trim()}
                              </TableCell>
                              {metricValues.map((value, idx) => (
                                <TableCell key={`${metric}-${filteredQuarters[idx].quarter}`} className="text-right font-mono whitespace-nowrap">
                                  {value !== null && value !== undefined
                                    ? (typeof value === 'string' && value.includes('%')
                                      ? value
                                      : formatCurrency(parseFloat(value)))
                                    : "—"}
                                </TableCell>
                              ))}
                              {showSignalColumn && (
                                <TableCell className="text-center sticky right-0 bg-background z-20 whitespace-nowrap border-l border-border">
                                  <SignalBadge signal={(formulaResultForSelected || formulaResult) as "BUY" | "SELL" | "HOLD" | "Check_OPM (Sell)" | "No Signal"} />
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
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
    </div >
  );
}
