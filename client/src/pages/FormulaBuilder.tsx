import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, Calculator, Save, Play, Loader2, AlertCircle, Check, ChevronsUpDown, HelpCircle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import type { Company, Sector, Formula } from "@shared/schema";
import QuarterlyDataSpreadsheet from "@/components/QuarterlyDataSpreadsheet";
import { sortQuarterStrings } from "@/utils/quarterUtils";
import SignalBadge from "@/components/SignalBadge";
import { FormulaEditor } from "@/components/FormulaEditor";
import { FormulaHelpPanel } from "@/components/FormulaHelpPanel";

interface QuarterlyDataResponse {
  sectorId?: string;
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

export default function FormulaBuilder() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [entityType, setEntityType] = useState<"global" | "company" | "sector">("company");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [formula, setFormula] = useState<string>("");
  const [formulaName, setFormulaName] = useState<string>("");
  // Signal field kept for backward compatibility with DB schema, but not used in UI
  const [formulaSignal] = useState<string>("");
  const [priority, setPriority] = useState<number>(999);
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>("");
  const [useExistingFormula, setUseExistingFormula] = useState<boolean>(false);
  const [selectedQuarters, setSelectedQuarters] = useState<Set<string>>(new Set());
  const [selectedQuartersForTable, setSelectedQuartersForTable] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [formulaResults, setFormulaResults] = useState<Record<string, { result: string | number | boolean; type: string }>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hasAutoEvaluated, setHasAutoEvaluated] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Preview state (separate from selected entity for Global formulas)
  const [previewType, setPreviewType] = useState<"company" | "sector">("company");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewCompanyOpen, setPreviewCompanyOpen] = useState(false);
  const [previewSectorOpen, setPreviewSectorOpen] = useState(false);
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);

  // Fetch companies
  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"]
  });

  // Fetch sectors
  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  // Sync preview settings with selected entity when not global
  useEffect(() => {
    if (entityType !== "global") {
      setPreviewType(entityType as "company" | "sector");
      setPreviewId(selectedEntityId);
    } else if (!previewId && companies && companies.length > 0) {
      // Default to first company for global preview if nothing selected
      setPreviewId(companies[0].id);
      setPreviewType("company");
    }
  }, [entityType, selectedEntityId, companies]);

  const formulaInputRef = useRef<HTMLTextAreaElement>(null);

  // Parse URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const id = params.get("id");
    const formulaId = params.get("formulaId");

    // Set entity type first (defaults to "company" if not specified)
    if (type === "company" || type === "sector" || type === "global") {
      setEntityType(type as "global" | "company" | "sector");
    }
    if (id) {
      setSelectedEntityId(id);
    }
    if (formulaId) {
      // Load the formula when formulaId is provided
      // The formula's scope will be used to set entityType in the selectedFormulaId effect
      setSelectedFormulaId(formulaId);
    }
  }, []);

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

  // Get selected entity details (for displaying selection info)
  const selectedCompany = useMemo(() => {
    if (entityType === "company" && selectedEntityId) {
      return companies?.find(c => c.id === selectedEntityId);
    }
    return null;
  }, [entityType, selectedEntityId, companies]);

  const selectedSector = useMemo(() => {
    if (entityType === "sector" && selectedEntityId) {
      return sectors?.find(s => s.id === selectedEntityId);
    }
    return null;
  }, [entityType, selectedEntityId, sectors]);

  // Get preview entity details
  const previewCompany = useMemo(() => {
    if (previewType === "company" && previewId) {
      return companies?.find(c => c.id === previewId);
    }
    return null;
  }, [previewType, previewId, companies]);

  const previewSector = useMemo(() => {
    if (previewType === "sector" && previewId) {
      return sectors?.find(s => s.id === previewId);
    }
    return null;
  }, [previewType, previewId, sectors]);

  // Check if preview entity is banking-related (must be after previewCompany and previewSector are defined)
  const isBankingEntity = useMemo(() => {
    if (previewType === "company" && previewCompany) {
      // Check if company's sector is banking
      if (previewCompany.sectorId && sectors) {
        const sector = sectors.find(s => s.id === previewCompany.sectorId);
        if (sector) {
          const sectorName = sector.name.toLowerCase();
          return sectorName.includes('bank') || sectorName.includes('banking') || sectorName.includes('financial');
        }
      }
    } else if (previewType === "sector" && previewSector) {
      // Check if sector is banking
      const sectorName = previewSector.name.toLowerCase();
      return sectorName.includes('bank') || sectorName.includes('banking') || sectorName.includes('financial');
    }
    return false;
  }, [previewType, previewCompany, previewSector, sectors]);

  // Fetch quarterly data based on entity type
  // Fetch quarterly data based on preview selection
  const { data: quarterlyData, isLoading: quarterlyLoading } = useQuery<QuarterlyDataResponse>({
    queryKey: ["/api/v1/formula-builder/quarterly-data", previewType, previewId],
    queryFn: async () => {
      if (!previewId) throw new Error("No entity selected for preview");
      if (!previewType) throw new Error("No preview type selected");

      if (previewType === "company") {
        const company = companies?.find(c => c.id === previewId);
        if (!company) {
          // If previewId doesn't match a company, it might be a sector ID - wait for state to sync
          throw new Error("Company not found. Please wait...");
        }

        // Fetch company quarterly data
        const res = await apiRequest("GET", `/api/v1/companies/${company.ticker}/data`);
        const data = await res.json();

        if (!data || !data.quarters || data.quarters.length === 0) {
          throw new Error("No quarterly data available for this company");
        }

        // Transform to QuarterlyDataResponse format
        const quarters = data.quarters.map((q: any) => q.quarter);
        const metrics = data.quarters.length > 0 ? Object.keys(data.quarters[0].metrics || {}) : [];

        return {
          quarters: sortQuarterStrings(quarters),
          metrics,
          companies: [{
            ticker: company.ticker,
            companyId: company.id,
            companyName: company.name || company.ticker,
            quarters: data.quarters.reduce((acc: Record<string, Record<string, string | null>>, q: any) => {
              acc[q.quarter] = q.metrics || {};
              return acc;
            }, {})
          }],
          raw: data.raw || []
        };
      } else if (previewType === "sector") {
        // Validate that previewId is actually a sector ID
        const sector = sectors?.find(s => s.id === previewId);
        if (!sector) {
          // If previewId doesn't match a sector, it might be a company ID - wait for state to sync
          throw new Error("Sector not found. Please wait...");
        }

        // Fetch sector quarterly data
        const res = await apiRequest("GET", `/api/v1/sectors/${previewId}/quarterly-data`);
        return res.json();
      } else {
        throw new Error("Invalid preview type");
      }
    },
    enabled: (() => {
      if (!previewId || !previewType) return false;
      if (previewType === "company") {
        return !!companies && companies.some(c => c.id === previewId);
      }
      if (previewType === "sector") {
        return !!sectors && sectors.some(s => s.id === previewId);
      }
      return false;
    })(),
    retry: 1, // Retry once in case of race condition
    retryDelay: 100 // Small delay to allow state to sync
  });

  // Sort quarterly data
  const sortedQuarterlyData = useMemo(() => {
    if (!quarterlyData) return null;
    return {
      ...quarterlyData,
      sectorId: quarterlyData.sectorId || "",
      quarters: sortQuarterStrings(quarterlyData.quarters)
    };
  }, [quarterlyData]);

  // Determine spreadsheet mode: for global, use previewType (company/sector)
  const spreadsheetMode = useMemo<"company" | "sector" | undefined>(() => {
    if (entityType === "global") return previewType || undefined;
    if (entityType === "company" || entityType === "sector") return entityType;
    return undefined;
  }, [entityType, previewType]);

  // Fetch existing formula for entity
  const { data: existingFormulaData } = useQuery<{ formula: Formula | null }>({
    queryKey: ["/api/v1/formulas/entity", entityType, selectedEntityId],
    queryFn: async () => {
      if (entityType === "global") {
        // For global, get the highest priority global formula
        const res = await apiRequest("GET", `/api/formulas`);
        const allFormulas: Formula[] = await res.json();
        const globalFormulas = allFormulas
          .filter(f => f.enabled && f.scope === "global")
          .sort((a, b) => a.priority - b.priority);
        return { formula: globalFormulas[0] || null };
      }
      if (!selectedEntityId) return { formula: null };
      const res = await apiRequest("GET", `/api/v1/formulas/entity/${entityType}/${selectedEntityId}`);
      return res.json();
    },
    enabled: (entityType === "global" || !!selectedEntityId) && !selectedFormulaId
  });

  // Fetch global formula as fallback
  const { data: formulas } = useQuery<Formula[]>({
    queryKey: ["/api/formulas"]
  });

  const globalFormula = useMemo(() => {
    if (!formulas) return null;
    const globalFormulas = formulas
      .filter(f => f.enabled && f.scope === "global")
      .sort((a, b) => a.priority - b.priority);
    return globalFormulas[0] || null;
  }, [formulas]);

  // Initialize formula from existing or global
  useEffect(() => {
    // Skip if we're loading/editing a specific formula via selectedFormulaId
    // Keep this guard to prevent overwriting user edits when editing an existing formula
    if (selectedFormulaId) return;
    
    if (!useExistingFormula && existingFormulaData?.formula) {
      setFormula(existingFormulaData.formula.condition);
      setFormulaName(existingFormulaData.formula.name);
      setPriority(existingFormulaData.formula.priority);
      setHasAutoEvaluated(false); // Reset to allow auto-evaluation
    } else if (!useExistingFormula && globalFormula && entityType === "global") {
      setFormula(globalFormula.condition);
      setFormulaName(globalFormula.name || "");
      setPriority(globalFormula.priority);
      setHasAutoEvaluated(false); // Reset to allow auto-evaluation
    }
  }, [existingFormulaData, globalFormula, selectedEntityId, useExistingFormula, entityType, selectedFormulaId]); // Reset when entity changes

  // Handle selected formula change - load formula and set entity type based on scope
  useEffect(() => {
    if (selectedFormulaId && formulas) {
      const selectedFormula = formulas.find(f => f.id === selectedFormulaId);
      if (selectedFormula) {
        // Set entity type based on formula's scope
        if (selectedFormula.scope === "global") {
          setEntityType("global");
          setSelectedEntityId(null);
        } else if (selectedFormula.scope === "company" && selectedFormula.scopeValue) {
          setEntityType("company");
          setSelectedEntityId(selectedFormula.scopeValue);
        } else if (selectedFormula.scope === "sector" && selectedFormula.scopeValue) {
          setEntityType("sector");
          setSelectedEntityId(selectedFormula.scopeValue);
        }
        
        // Load formula data - this will trigger FormulaEditor to update via value prop
        setFormula(selectedFormula.condition);
        setFormulaName(selectedFormula.name);
        setPriority(selectedFormula.priority);
        setUseExistingFormula(true);
        setHasAutoEvaluated(false);
      }
    }
  }, [selectedFormulaId, formulas]);

  // Initialize selected quarters and metrics
  // Uses orderedVisibleMetrics/orderedVisibleBankingMetrics which respect both visibility AND order
  useEffect(() => {
    if (sortedQuarterlyData && selectedMetrics.length === 0) {
      // Default to last 12 quarters
      const quartersToShow = sortedQuarterlyData.quarters.length > 12
        ? sortedQuarterlyData.quarters.slice(-12)
        : sortedQuarterlyData.quarters;
      setSelectedQuartersForTable(quartersToShow);
      setSelectedQuarters(new Set(quartersToShow));

      // Use banking metrics for banking entities, default metrics for others
      // Prefer ordered visible metrics (respects display order from settings)
      if (isBankingEntity) {
        if (defaultMetricsData?.orderedVisibleBankingMetrics && defaultMetricsData.orderedVisibleBankingMetrics.length > 0) {
          setSelectedMetrics(defaultMetricsData.orderedVisibleBankingMetrics);
        } else if (defaultMetricsData?.visibleBankingMetrics && defaultMetricsData.visibleBankingMetrics.length > 0) {
          // Fallback to unordered visible metrics
          setSelectedMetrics(defaultMetricsData.visibleBankingMetrics);
        }
      } else {
        if (defaultMetricsData?.orderedVisibleMetrics && defaultMetricsData.orderedVisibleMetrics.length > 0) {
          setSelectedMetrics(defaultMetricsData.orderedVisibleMetrics);
        } else if (defaultMetricsData?.visibleMetrics && defaultMetricsData.visibleMetrics.length > 0) {
          // Fallback to unordered visible metrics
          setSelectedMetrics(defaultMetricsData.visibleMetrics);
        }
      }
      // If defaultMetricsData hasn't loaded yet, wait for it rather than using fallbacks
      // This ensures consistency with what's saved in the database
      
      setHasAutoEvaluated(false); // Reset auto-evaluation flag when data changes
    }
  }, [sortedQuarterlyData, selectedMetrics.length, defaultMetricsData, isBankingEntity]);

  // Auto-evaluate formula when entity is first selected or formula is loaded
  useEffect(() => {
    if (formula && previewId && sortedQuarterlyData && selectedQuarters.size > 0 && !hasAutoEvaluated) {
      // Use setTimeout to avoid calling during render
      const timer = setTimeout(async () => {
        await handleTestFormula();
        setHasAutoEvaluated(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, previewId, sortedQuarterlyData, hasAutoEvaluated]); // Only auto-evaluate once when data loads

  // Handle cell selection to add to formula
  const handleCellSelect = (metric: string, quarter: string) => {
    if (!sortedQuarterlyData) return;

    const index = selectedQuartersForTable.indexOf(quarter);
    if (index === -1) return;
    // Q1 = Oldest in selected window
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

      setFormula(newText);
      setUseExistingFormula(false);
      // Don't clear selectedFormulaId when inserting from spreadsheet - keep it for updating

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
      setFormula(prev => prev + (prev ? " " : "") + reference);
      setUseExistingFormula(false);
      // Don't clear selectedFormulaId when inserting from spreadsheet - keep it for updating
    }

    // Add quarter to selected set
    const newSet = new Set(selectedQuarters);
    newSet.add(quarter);
    setSelectedQuarters(newSet);

    // Add to selected cells for visual feedback
    setSelectedCells(prev => new Set(prev).add(`${metric}:${quarter}`));
  };

  // Test formula
  const handleTestFormula = async () => {
    if (!formula.trim()) return; // Don't evaluate empty formulas
    if (!formula || !previewId || !sortedQuarterlyData) {
      toast({
        title: "Missing information",
        description: "Please select an entity and enter a formula",
        variant: "destructive"
      });
      return;
    }

    setIsEvaluating(true);
    try {
      const results: Record<string, { result: string | number | boolean; type: string }> = {};

      if (previewType === "company" && previewCompany) {
        // Evaluate for single company
        const res = await apiRequest("POST", "/api/v1/formulas/test-excel", {
          ticker: previewCompany.ticker,
          formula: formula,
          selectedQuarters: Array.from(selectedQuarters)
        });
        const data = await res.json();

        let actualResult = data.result;
        let actualType = data.resultType;

        if (actualResult && typeof actualResult === 'object' && 'result' in actualResult) {
          actualType = actualResult.resultType || actualType;
          actualResult = actualResult.result;
        }

        results[previewCompany.ticker] = { result: actualResult, type: actualType };
        // For single company view, also store under "result" key for display
        results["result"] = { result: actualResult, type: actualType };
      } else if (previewType === "sector" && sortedQuarterlyData.companies.length > 0) {
        // Evaluate for each company in sector
        for (const company of sortedQuarterlyData.companies) {
          try {
            const res = await apiRequest("POST", "/api/v1/formulas/test-excel", {
              ticker: company.ticker,
              formula: formula,
              selectedQuarters: Array.from(selectedQuarters)
            });
            const data = await res.json();

            let actualResult = data.result;
            let actualType = data.resultType;

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
      }

      setFormulaResults(results);
      toast({
        title: "Formula evaluated",
        description: `Evaluated for ${Object.keys(results).length} ${entityType === "company" ? "company" : "companies"}`
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
  };

  // Save formula mutation
  const saveFormulaMutation = useMutation({
    mutationFn: async (data: { name: string; condition: string; signal: string; scope: string; scopeValue: string | null; priority: number }) => {
      const res = await apiRequest("POST", "/api/formulas", {
        ...data,
        enabled: true
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Formula saved",
        description: `Formula has been saved for this ${entityType}`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/formulas/entity", entityType, selectedEntityId] });
      // Reset to allow creating another formula
      setSelectedFormulaId("");
      setUseExistingFormula(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save formula",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Handle update formula (for existing formulas)
  const handleUpdateFormula = async () => {
    if (!formula || !formulaName) {
      toast({
        title: "Missing information",
        description: "Please enter a formula name and formula condition",
        variant: "destructive"
      });
      return;
    }

    if (!selectedFormulaId) {
      toast({
        title: "No formula selected",
        description: "Please select a formula to update",
        variant: "destructive"
      });
      return;
    }

    setIsUpdating(true);
    try {
      await apiRequest("PUT", `/api/formulas/${selectedFormulaId}`, {
        name: formulaName,
        condition: formula,
        signal: "", // Formulas return signals dynamically, so signal field is not used
        scope: entityType,
        scopeValue: entityType === "global" ? null : selectedEntityId,
        priority: priority
      });
      toast({
        title: "Formula updated",
        description: `Formula has been updated${entityType === "global" ? " as global" : ` for this ${entityType}`}`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      if (entityType !== "global") {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/formulas/entity", entityType, selectedEntityId] });
      }
    } catch (error: any) {
      toast({
        title: "Failed to update formula",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle save formula (for new formulas)
  const handleSaveFormula = () => {
    if (!formula || !formulaName) {
      toast({
        title: "Missing information",
        description: "Please enter a formula name and formula condition",
        variant: "destructive"
      });
      return;
    }

    if (entityType !== "global" && !selectedEntityId) {
      toast({
        title: "No entity selected",
        description: "Please select a company or sector",
        variant: "destructive"
      });
      return;
    }

    // Create new formula
    saveFormulaMutation.mutate({
      name: formulaName,
      condition: formula,
      signal: "", // Formulas return signals dynamically, so signal field is not used
      scope: entityType,
      scopeValue: entityType === "global" ? null : selectedEntityId,
      priority: priority
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Formula Builder</h1>
          <p className="text-muted-foreground">Build and test formulas for companies or sectors</p>
        </div>
      </div>

      {/* Entity Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Entity</CardTitle>
          <CardDescription>Choose a company or sector to build a formula for</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={entityType} onValueChange={(value) => {
            setEntityType(value as "global" | "company" | "sector");
            setSelectedEntityId(null);
            setFormulaResults({});
            setFormula("");
            setFormulaName("");
            setPriority(999);
            setHasAutoEvaluated(false);
          }}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="global" id="global" />
              <Label htmlFor="global">Global</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="company" id="company" />
              <Label htmlFor="company">Company</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sector" id="sector" />
              <Label htmlFor="sector">Sector</Label>
            </div>
          </RadioGroup>

          {entityType === "company" && (
            <Select value={selectedEntityId || ""} onValueChange={setSelectedEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(company => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.ticker} - {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {entityType === "sector" && (
            <Select value={selectedEntityId || ""} onValueChange={setSelectedEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a sector" />
              </SelectTrigger>
              <SelectContent>
                {sectors?.map(sector => (
                  <SelectItem key={sector.id} value={sector.id}>
                    {sector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {entityType === "global" && (
            <div className="p-3 bg-muted rounded-md space-y-4">
              <p className="text-sm">
                <span className="font-medium">Global Formula:</span> This formula will apply to all companies and sectors.
              </p>

              <div className="space-y-2 pt-2 border-t border-muted-foreground/20">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Preview Data Source</Label>
                <p className="text-xs text-muted-foreground pb-2">Select a company or sector to visualize data and test your global formula</p>
                <RadioGroup
                  value={previewType}
                  onValueChange={(v) => {
                    setPreviewType(v as "company" | "sector");
                    setPreviewId(null);
                  }}
                  className="flex gap-4 mb-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="company" id="prev-company" />
                    <Label htmlFor="prev-company">Preview with Company</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sector" id="prev-sector" />
                    <Label htmlFor="prev-sector">Preview with Sector</Label>
                  </div>
                </RadioGroup>

                {previewType === "company" ? (
                  <Popover open={previewCompanyOpen} onOpenChange={setPreviewCompanyOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={previewCompanyOpen}
                        className="w-full justify-between"
                      >
                        {previewId
                          ? `${previewCompany?.ticker} - ${previewCompany?.name}`
                          : "Select a company for preview"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search companies..." />
                        <CommandList>
                          <CommandEmpty>No company found.</CommandEmpty>
                          <CommandGroup>
                            {companies?.map((company) => (
                              <CommandItem
                                key={company.id}
                                value={`${company.ticker} ${company.name}`}
                                onSelect={() => {
                                  setPreviewId(company.id);
                                  setPreviewCompanyOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    previewId === company.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {company.ticker} - {company.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover open={previewSectorOpen} onOpenChange={setPreviewSectorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={previewSectorOpen}
                        className="w-full justify-between"
                      >
                        {previewId
                          ? previewSector?.name
                          : "Select a sector for preview"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search sectors..." />
                        <CommandList>
                          <CommandEmpty>No sector found.</CommandEmpty>
                          <CommandGroup>
                            {sectors?.map((sector) => (
                              <CommandItem
                                key={sector.id}
                                value={sector.name}
                                onSelect={() => {
                                  setPreviewId(sector.id);
                                  setPreviewSectorOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    previewId === sector.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {sector.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          )}

          {(selectedEntityId || entityType === "global") && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm">
                <span className="font-medium">Selected:</span>{" "}
                {entityType === "global"
                  ? "Global (applies to all entities)"
                  : entityType === "company"
                    ? `${selectedCompany?.ticker} - ${selectedCompany?.name}`
                    : selectedSector?.name}
              </p>
              {entityType === "global" && (previewCompany || previewSector) && (
                <p className="text-sm">
                  <span className="font-medium">Previewing with:</span>{" "}
                  {previewType === "company"
                    ? `${previewCompany?.ticker} - ${previewCompany?.name}`
                    : previewSector?.name}
                </p>
              )}
              {existingFormulaData?.formula && (
                <p className="text-xs text-muted-foreground mt-1">
                  Using existing formula: {existingFormulaData.formula.name}
                </p>
              )}
              {!existingFormulaData?.formula && globalFormula && (
                <p className="text-xs text-muted-foreground mt-1">
                  Using global formula: {globalFormula.name}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formula Input */}
      {(selectedEntityId || entityType === "global") && (previewId || entityType !== "global") && (
        <Card>
          <CardHeader>
            <CardTitle>Formula</CardTitle>
            <CardDescription>Enter Excel formula or click cells in the table below to add references</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Existing Formula or Create New</Label>
              <Select
                value={selectedFormulaId || "new"}
                onValueChange={(value) => {
                  if (value === "new") {
                    setSelectedFormulaId("");
                    setUseExistingFormula(false);
                    // Clear formula to allow creating new
                    setFormula("");
                    setFormulaName("");
                  } else {
                    setSelectedFormulaId(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a formula or create new" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create New Formula</SelectItem>
                  {formulas?.filter(f => f.enabled).map((formula) => (
                    <SelectItem key={formula.id} value={formula.id}>
                      {formula.name} - {formula.scope}
                      {formula.scopeValue && `: ${formula.scopeValue}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="formula-name">Formula Name</Label>
              <Input
                id="formula-name"
                type="text"
                value={formulaName}
                onChange={(e) => {
                  setFormulaName(e.target.value);
                  // Don't clear selectedFormulaId when editing name - we want to update the existing formula
                  setUseExistingFormula(false);
                }}
                placeholder="e.g., Custom Formula for IT Sector"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="formula">Formula Condition</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setHelpPanelOpen(true)}
                  title="Open formula help"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </div>
              <FormulaEditor
                value={formula}
                onChange={(val) => {
                  setFormula(val);
                  // Don't clear selectedFormulaId when editing - we want to update the existing formula
                  // Only set useExistingFormula to false to indicate formula content has changed
                  setUseExistingFormula(false);
                }}
                textareaRef={formulaInputRef}
                placeholder='e.g., IF(AND(SalesGrowth[Q1]>0, EPS[Q1]>10), "BUY", "HOLD")'
                height="min-h-32"
              />
            </div>
            <div className="flex gap-2 pt-6">
                <Button onClick={handleTestFormula} disabled={isEvaluating || !formula}>
                  {isEvaluating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Test Formula
                    </>
                  )}
                </Button>
                {selectedFormulaId ? (
                  <Button onClick={handleUpdateFormula} disabled={isUpdating || !formula || !formulaName} variant="default">
                    {isUpdating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Pencil className="h-4 w-4 mr-2" />
                        Update Formula
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={handleSaveFormula} disabled={saveFormulaMutation.isPending || !formula || !formulaName}>
                    {saveFormulaMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Formula
                      </>
                    )}
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quarterly Data Spreadsheet */}
      {(selectedEntityId || entityType === "global") && (
        <Card>
          <CardHeader>
            <CardTitle>Quarterly Data</CardTitle>
            <CardDescription>
              Click on cells to add metric references to your formula. Results will appear in the Result column.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quarterlyLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !sortedQuarterlyData ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No quarterly data available. Please scrape data for this {entityType} first.
                </AlertDescription>
              </Alert>
            ) : (
              <QuarterlyDataSpreadsheet
                data={sortedQuarterlyData}
                selectedMetrics={selectedMetrics}
                selectedQuarters={selectedQuartersForTable}
                onCellSelect={handleCellSelect}
                selectedCells={selectedCells}
                formulaResults={formulaResults}
                mode={spreadsheetMode || "sector"}
              />
            )}
          </CardContent>
        </Card>
      )}

      {!selectedEntityId && entityType !== "global" && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Please select a {entityType} to begin building a formula
          </CardContent>
        </Card>
      )}

      <FormulaHelpPanel open={helpPanelOpen} onOpenChange={setHelpPanelOpen} />
    </div>
  );
}

