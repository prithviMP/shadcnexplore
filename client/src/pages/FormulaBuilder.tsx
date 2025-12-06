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
import { ArrowLeft, Calculator, Save, Play, Loader2, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Company, Sector, Formula } from "@shared/schema";
import QuarterlyDataSpreadsheet from "@/components/QuarterlyDataSpreadsheet";
import { sortQuarterStrings } from "@/utils/quarterUtils";
import SignalBadge from "@/components/SignalBadge";

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
  const [formulaSignal, setFormulaSignal] = useState<string>("BUY");
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

  const formulaInputRef = useRef<HTMLTextAreaElement>(null);

  // Parse URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const id = params.get("id");
    const formulaId = params.get("formulaId");

    if (type === "company" || type === "sector" || type === "global") {
      setEntityType(type as "global" | "company" | "sector");
    }
    if (id) {
      setSelectedEntityId(id);
    }
    if (formulaId) {
      // Load the formula when formulaId is provided
      setSelectedFormulaId(formulaId);
    }
  }, []);

  // Fetch companies
  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"]
  });

  // Fetch sectors
  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  // Fetch default metrics from settings
  const { data: defaultMetricsData } = useQuery<{
    metrics: Record<string, boolean>;
    visibleMetrics: string[];
  }>({
    queryKey: ["/api/settings/default-metrics"],
    retry: 1, // Retry once if it fails
  });

  // Get selected entity details
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

  // Fetch quarterly data based on entity type
  const { data: quarterlyData, isLoading: quarterlyLoading } = useQuery<QuarterlyDataResponse>({
    queryKey: ["/api/v1/formula-builder/quarterly-data", entityType, selectedEntityId],
    queryFn: async () => {
      // For global scope, we can use the first company or sector for preview
      if (entityType === "global") {
        // Use first company for preview if available
        if (companies && companies.length > 0) {
          const firstCompany = companies[0];
          const res = await apiRequest("GET", `/api/v1/companies/${firstCompany.ticker}/data`);
          const data = await res.json();
          
          if (!data || !data.quarters || data.quarters.length === 0) {
            throw new Error("No quarterly data available for preview");
          }

          const quarters = data.quarters.map((q: any) => q.quarter);
          const metrics = data.quarters.length > 0 ? Object.keys(data.quarters[0].metrics || {}) : [];

          return {
            quarters: sortQuarterStrings(quarters),
            metrics,
            companies: [{
              ticker: firstCompany.ticker,
              companyId: firstCompany.id,
              companyName: firstCompany.name || firstCompany.ticker,
              quarters: data.quarters.reduce((acc: Record<string, Record<string, string | null>>, q: any) => {
                acc[q.quarter] = q.metrics || {};
                return acc;
              }, {})
            }],
            raw: data.raw || []
          };
        }
        throw new Error("No companies available for preview");
      }

      if (!selectedEntityId) throw new Error("No entity selected");

      if (entityType === "company" && selectedCompany) {
        // Fetch company quarterly data
        const res = await apiRequest("GET", `/api/v1/companies/${selectedCompany.ticker}/data`);
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
            ticker: selectedCompany.ticker,
            companyId: selectedCompany.id,
            companyName: selectedCompany.name || selectedCompany.ticker,
            quarters: data.quarters.reduce((acc: Record<string, Record<string, string | null>>, q: any) => {
              acc[q.quarter] = q.metrics || {};
              return acc;
            }, {})
          }],
          raw: data.raw || []
        };
      } else if (entityType === "sector") {
        // Fetch sector quarterly data
        const res = await apiRequest("GET", `/api/v1/sectors/${selectedEntityId}/quarterly-data`);
        return res.json();
      }
      throw new Error("Invalid entity type");
    },
    enabled: entityType === "global" || (!!selectedEntityId && ((entityType === "company" && !!selectedCompany) || (entityType === "sector" && !!selectedSector)))
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
    enabled: entityType === "global" || !!selectedEntityId
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
    if (!useExistingFormula && existingFormulaData?.formula) {
      setFormula(existingFormulaData.formula.condition);
      setFormulaName(existingFormulaData.formula.name);
      setFormulaSignal(existingFormulaData.formula.signal);
      setPriority(existingFormulaData.formula.priority);
      setHasAutoEvaluated(false); // Reset to allow auto-evaluation
    } else if (!useExistingFormula && globalFormula && entityType === "global") {
      setFormula(globalFormula.condition);
      setFormulaName(globalFormula.name || "");
      setFormulaSignal(globalFormula.signal);
      setPriority(globalFormula.priority);
      setHasAutoEvaluated(false); // Reset to allow auto-evaluation
    }
  }, [existingFormulaData, globalFormula, selectedEntityId, useExistingFormula, entityType]); // Reset when entity changes

  // Handle selected formula change
  useEffect(() => {
    if (selectedFormulaId && formulas) {
      const selectedFormula = formulas.find(f => f.id === selectedFormulaId);
      if (selectedFormula) {
        setFormula(selectedFormula.condition);
        setFormulaName(selectedFormula.name);
        setFormulaSignal(selectedFormula.signal);
        setPriority(selectedFormula.priority);
        setUseExistingFormula(true);
        setHasAutoEvaluated(false);
      }
    }
  }, [selectedFormulaId, formulas]);

  // Initialize selected quarters and metrics
  useEffect(() => {
    if (sortedQuarterlyData && selectedMetrics.length === 0) {
      // Default to last 12 quarters
      const quartersToShow = sortedQuarterlyData.quarters.length > 12
        ? sortedQuarterlyData.quarters.slice(-12)
        : sortedQuarterlyData.quarters;
      setSelectedQuartersForTable(quartersToShow);
      setSelectedQuarters(new Set(quartersToShow));

      // Use default metrics from settings API if available
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
          'OPM %',
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
        setSelectedMetrics(matchedMetrics);
      } else if (sortedQuarterlyData.metrics.length > 0) {
        // If default metrics not found, use first 6 metrics
        setSelectedMetrics(sortedQuarterlyData.metrics.slice(0, Math.min(6, sortedQuarterlyData.metrics.length)));
      }
      setHasAutoEvaluated(false); // Reset auto-evaluation flag when data changes
    }
  }, [sortedQuarterlyData, selectedMetrics.length, defaultMetricsData]);

  // Auto-evaluate formula when entity is first selected or formula is loaded
  useEffect(() => {
    if (formula && selectedEntityId && sortedQuarterlyData && selectedQuarters.size > 0 && !hasAutoEvaluated) {
      // Use setTimeout to avoid calling during render
      const timer = setTimeout(async () => {
        await handleTestFormula();
        setHasAutoEvaluated(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, selectedEntityId, sortedQuarterlyData, hasAutoEvaluated]); // Only auto-evaluate once when data loads

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
      setSelectedFormulaId("");

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
      setSelectedFormulaId("");
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
    if (!formula || !selectedEntityId || !sortedQuarterlyData) {
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

      if (entityType === "global" && sortedQuarterlyData && sortedQuarterlyData.companies.length > 0) {
        // For global, evaluate on the preview company
        const previewCompany = sortedQuarterlyData.companies[0];
        try {
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
          results["result"] = { result: actualResult, type: actualType };
        } catch (err) {
          console.error(`Failed to evaluate for ${previewCompany.ticker}`, err);
          results[previewCompany.ticker] = { result: "Error", type: "error" };
        }
      } else if (entityType === "company" && selectedCompany) {
        // Evaluate for single company
        const res = await apiRequest("POST", "/api/v1/formulas/test-excel", {
          ticker: selectedCompany.ticker,
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

        results[selectedCompany.ticker] = { result: actualResult, type: actualType };
        // For single company view, also store under "result" key for display
        results["result"] = { result: actualResult, type: actualType };
      } else if (entityType === "sector" && sortedQuarterlyData.companies.length > 0) {
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

  // Handle save formula
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

    // If using existing formula, update it; otherwise create new
    if (selectedFormulaId && useExistingFormula) {
      // Update existing formula
      apiRequest("PUT", `/api/formulas/${selectedFormulaId}`, {
        name: formulaName,
        condition: formula,
        signal: formulaSignal,
        scope: entityType,
        scopeValue: entityType === "global" ? null : selectedEntityId,
        priority: priority
      }).then(() => {
        toast({
          title: "Formula updated",
          description: `Formula has been updated${entityType === "global" ? " as global" : ` for this ${entityType}`}`
        });
        queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
        if (entityType !== "global") {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/formulas/entity", entityType, selectedEntityId] });
        }
      }).catch((error: Error) => {
        toast({
          title: "Failed to update formula",
          description: error.message,
          variant: "destructive"
        });
      });
    } else {
      // Create new formula
      saveFormulaMutation.mutate({
        name: formulaName,
        condition: formula,
        signal: formulaSignal,
        scope: entityType,
        scopeValue: entityType === "global" ? null : selectedEntityId,
        priority: priority
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/formulas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
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
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm">
                <span className="font-medium">Global Formula:</span> This formula will apply to all companies and sectors. Use priority to override other formulas.
              </p>
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
      {(selectedEntityId || entityType === "global") && (
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
                    setFormulaSignal("BUY");
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
                      {formula.name} ({formula.signal}) - {formula.scope}
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
                  setUseExistingFormula(false); // User is editing, so it's a new formula
                  setSelectedFormulaId(""); // Clear selection when editing
                }}
                placeholder="e.g., Custom Formula for IT Sector"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="999"
                value={priority}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 999;
                  setPriority(val);
                  setUseExistingFormula(false);
                  setSelectedFormulaId("");
                }}
                placeholder="999"
              />
              <p className="text-xs text-muted-foreground">
                Lower number = higher priority. Global formulas with lower priority will override sector/company formulas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="formula">Formula Condition</Label>
              <Textarea
                id="formula"
                value={formula}
                onChange={(e) => {
                  setFormula(e.target.value);
                  setUseExistingFormula(false); // User is editing, so it's a new formula
                  setSelectedFormulaId(""); // Clear selection when editing
                }}
                placeholder='e.g., IF(AND(SalesGrowth[Q1]>0, EPS[Q1]>10), "BUY", "HOLD")'
                className="font-mono text-sm min-h-32"
                ref={formulaInputRef}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label htmlFor="signal">Expected Signal</Label>
                <Select value={formulaSignal} onValueChange={setFormulaSignal}>
                  <SelectTrigger id="signal" className="w-[180px]">
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
              </div>
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
                mode={entityType}
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
    </div>
  );
}

