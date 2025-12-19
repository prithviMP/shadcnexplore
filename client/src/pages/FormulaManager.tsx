import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TestTube, Loader2, Play, Search, Calculator, BarChart3, RotateCcw } from "lucide-react";
import SignalBadge from "@/components/SignalBadge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertFormulaSchema, type Formula, type Company, type Sector } from "@shared/schema";
import { z } from "zod";
import { sortQuarters, formatQuarterWithLabel } from "@/utils/quarterUtils";

const formulaFormSchema = insertFormulaSchema.extend({
  scopeValue: z.string().optional().nullable(),
});

type FormulaFormData = z.infer<typeof formulaFormSchema>;

// Helper to format values for display
const formatValue = (value: number | string | null, metric: string): string => {
  if (value === null || value === undefined) return "—";
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return String(value);
  
  const metricLower = metric.toLowerCase();
  
  // Format percentages
  if (metricLower.includes('%') || metricLower.includes('growth') || metricLower.includes('margin')) {
    return `${numValue.toFixed(2)}%`;
  }
  
  // Format currency values (large numbers)
  if (metricLower.includes('sales') || metricLower.includes('profit') || metricLower.includes('revenue') || 
      metricLower.includes('income') || metricLower.includes('expense') || metricLower.includes('tax')) {
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
  
  // EPS in Rs - show with rupee symbol
  if (metricLower.includes('eps') && !metricLower.includes('%')) {
    return `₹${numValue.toFixed(2)}`;
  }
  
  return numValue.toFixed(2);
};

export default function FormulaManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);
  const [testingFormula, setTestingFormula] = useState<{ formula: Formula; ticker: string } | null>(null);
  const [replacingFormula, setReplacingFormula] = useState<Formula | null>(null);
  const [selectedReplacementFormulaId, setSelectedReplacementFormulaId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [showQuarterlyData, setShowQuarterlyData] = useState(false);
  const [resetToGlobalDialogOpen, setResetToGlobalDialogOpen] = useState(false);
  const [selectedGlobalFormulaId, setSelectedGlobalFormulaId] = useState<string>("");
  const { toast } = useToast();

  const { data: formulas = [], isLoading } = useQuery<Formula[]>({
    queryKey: ["/api/formulas"],
  });

  // Fetch companies for selection
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  // Fetch sectors to map IDs to names
  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
  });

  // Create a map of sector ID to sector name
  const sectorMap = useMemo(() => {
    const map = new Map<string, string>();
    sectors.forEach(sector => {
      map.set(sector.id, sector.name);
    });
    return map;
  }, [sectors]);

  // Helper function to format scope display
  const formatScopeDisplay = (scope: string, scopeValue: string | null): string => {
    if (scope === "global") {
      return "global";
    }
    if (scope === "sector" && scopeValue) {
      // Check if scopeValue is a sector ID (UUID format) or already a name
      const sectorName = sectorMap.get(scopeValue);
      if (sectorName) {
        return `sector: ${sectorName}`;
      }
      // If not found in map, it might already be a name (legacy data)
      return `sector: ${scopeValue}`;
    }
    if (scope === "company" && scopeValue) {
      // For companies, show company ticker
      const company = companies.find(c => c.id === scopeValue);
      if (company) {
        return `company: ${company.ticker}`;
      }
      return `company: ${scopeValue}`;
    }
    return scope;
  };

  // Get the selected company's ticker
  const selectedCompany = useMemo(() => {
    return companies.find(c => c.id === selectedCompanyId);
  }, [companies, selectedCompanyId]);

  const testTicker = selectedCompany?.ticker || "";

  // Fetch quarterly data for selected company
  const { data: quarterlyData, isLoading: quarterlyLoading } = useQuery<{
    ticker: string;
    quarters: Array<{
      quarter: string;
      metrics: Record<string, number | string>;
    }>;
  }>({
    queryKey: ["/api/v1/companies", testTicker, "data"],
    queryFn: async () => {
      if (!testTicker) return { ticker: "", quarters: [] };
      const res = await apiRequest("GET", `/api/v1/companies/${testTicker}/data`);
      return res.json();
    },
    enabled: !!testTicker && dialogOpen,
  });

  // Sort quarterly data (most recent last)
  const sortedQuarterlyData = useMemo(() => {
    if (!quarterlyData?.quarters) return null;
    const sortedQuarters = sortQuarters(quarterlyData.quarters.map(q => q.quarter));
    const quartersMap = new Map(quarterlyData.quarters.map(q => [q.quarter, q]));
    return {
      ...quarterlyData,
      quarters: sortedQuarters.map(q => quartersMap.get(q)!).filter(Boolean),
    };
  }, [quarterlyData]);

  // Get available metrics
  const availableMetrics = useMemo(() => {
    if (!sortedQuarterlyData?.quarters?.length) return [];
    return Object.keys(sortedQuarterlyData.quarters[0].metrics);
  }, [sortedQuarterlyData]);

  // Default 6 metrics to display
  const displayMetrics = useMemo(() => {
    const defaultMetricNames = [
      'Sales',
      'Sales Growth(YoY) %',
      'Sales Growth(QoQ) %',
      'EPS in Rs',
      'EPS Growth(YoY) %',
      'EPS Growth(QoQ) %',
    ];
    const matched = defaultMetricNames.filter(m => availableMetrics.includes(m));
    return matched.length > 0 ? matched : availableMetrics.slice(0, 6);
  }, [availableMetrics]);

  // Get last 12 quarters
  const displayQuarters = useMemo(() => {
    if (!sortedQuarterlyData?.quarters) return [];
    return sortedQuarterlyData.quarters.slice(-12);
  }, [sortedQuarterlyData]);

  const form = useForm<FormulaFormData>({
    resolver: zodResolver(formulaFormSchema),
    defaultValues: {
      name: "",
      scope: "global",
      scopeValue: null,
      condition: "",
      signal: "BUY",
      priority: 999,
      enabled: true,
    },
  });

  const createFormula = useMutation({
    mutationFn: async (data: FormulaFormData) => {
      const res = await apiRequest("POST", "/api/formulas", data);
      return res.json();
    },
    onSuccess: (data: Formula) => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      toast({ title: "Formula created successfully" });
      setDialogOpen(false);
      form.reset();
      
      // Navigate to formula builder if scope is company or sector
      if (data.scope === "company" && data.scopeValue) {
        window.location.href = `/formula-builder?type=company&id=${data.scopeValue}`;
      } else if (data.scope === "sector" && data.scopeValue) {
        window.location.href = `/formula-builder?type=sector&id=${data.scopeValue}`;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create formula",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const updateFormula = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Formula> }) =>
      apiRequest("PUT", `/api/formulas/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      toast({ title: "Formula updated successfully" });
      setDialogOpen(false);
      setEditingFormula(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update formula",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const deleteFormula = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/formulas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({ title: "Formula deleted successfully" });
      setReplacingFormula(null);
      setSelectedReplacementFormulaId("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete formula",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const replaceAndDeleteFormula = useMutation({
    mutationFn: async ({ oldFormulaId, newFormulaId }: { oldFormulaId: string; newFormulaId: string }) => {
      // First replace the formula
      const replaceRes = await apiRequest("POST", `/api/formulas/${oldFormulaId}/replace`, { newFormulaId });
      const replaceData = await replaceRes.json();
      
      // Then delete the old formula
      await apiRequest("DELETE", `/api/formulas/${oldFormulaId}`);
      
      return replaceData;
    },
    onSuccess: (data: { companiesAffected: number; sectorsAffected: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({
        title: "Main formula replaced and deleted",
        description: data.message,
      });
      setReplacingFormula(null);
      setSelectedReplacementFormulaId("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to replace and delete formula",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const calculateSignals = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/signals/calculate", {});
      return res.json();
    },
    onSuccess: (data: { signalsGenerated: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({
        title: "Signals calculated successfully",
        description: `Generated ${data.signalsGenerated} signal${data.signalsGenerated !== 1 ? 's' : ''}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to calculate signals",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const resetAllToGlobal = useMutation({
    mutationFn: async (formulaId: string | null) => {
      const res = await apiRequest("POST", "/api/formulas/reset-all-to-global", { formulaId: formulaId || null });
      return res.json();
    },
    onSuccess: (data: { companiesAffected: number; sectorsAffected: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      setResetToGlobalDialogOpen(false);
      setSelectedGlobalFormulaId("");
      toast({
        title: "All formulas reset to global",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reset formulas",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const testExcelFormula = useMutation({
    mutationFn: async ({ ticker, formula }: { ticker: string; formula: string }) => {
      const res = await apiRequest("POST", "/api/v1/formulas/test-excel", { ticker, formula });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Formula Test Result",
        description: `Result: ${data.result} (${data.resultType})`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const evaluatePreview = useMutation({
    mutationFn: async ({ ticker, formula }: { ticker: string; formula: string }) => {
      const res = await apiRequest("POST", "/api/v1/formulas/test-excel", { ticker, formula });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewResult(data);
    },
    onError: () => {
      setPreviewResult(null);
    },
  });

  const watchedCondition = form.watch("condition");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (testTicker && watchedCondition && dialogOpen) {
        evaluatePreview.mutate({ ticker: testTicker, formula: watchedCondition });
      }
    }, 800); // Debounce 800ms

    return () => clearTimeout(timer);
  }, [testTicker, watchedCondition, dialogOpen]);

  const handleToggle = (formula: Formula) => {
    updateFormula.mutate({
      id: formula.id,
      data: { enabled: !formula.enabled }
    });
  };

  const handleDelete = async (formula: Formula) => {
    // Check if this is a main (global) formula
    if (formula.scope === "global") {
      // Show replacement dialog for main formula
      setReplacingFormula(formula);
      setSelectedReplacementFormulaId("");
      return;
    }

    // For non-global formulas, show regular confirmation
    if (confirm("Are you sure you want to delete this formula?")) {
      deleteFormula.mutate(formula.id);
    }
  };

  const handleConfirmReplaceAndDelete = () => {
    if (!replacingFormula || !selectedReplacementFormulaId) {
      toast({
        title: "Please select a replacement formula",
        variant: "destructive"
      });
      return;
    }

    if (replacingFormula.id === selectedReplacementFormulaId) {
      toast({
        title: "Cannot replace formula with itself",
        variant: "destructive"
      });
      return;
    }

    replaceAndDeleteFormula.mutate({
      oldFormulaId: replacingFormula.id,
      newFormulaId: selectedReplacementFormulaId
    });
  };

  const handleEdit = (formula: Formula) => {
    // Navigate to formula builder with the formula's scope and scopeValue
    if (formula.scope === "company" && formula.scopeValue) {
      window.location.href = `/formula-builder?type=company&id=${formula.scopeValue}&formulaId=${formula.id}`;
    } else if (formula.scope === "sector" && formula.scopeValue) {
      window.location.href = `/formula-builder?type=sector&id=${formula.scopeValue}&formulaId=${formula.id}`;
    } else {
      // For global formulas, just navigate to formula builder
      window.location.href = `/formula-builder?formulaId=${formula.id}`;
    }
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingFormula(null);
      form.reset();
    }
  };

  const onSubmit = (data: FormulaFormData) => {
    if (editingFormula) {
      updateFormula.mutate({ id: editingFormula.id, data });
    } else {
      createFormula.mutate(data);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Formula Manager
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Define and manage signal generation formulas</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            onClick={() => setResetToGlobalDialogOpen(true)}
            variant="outline"
            size="sm"
            className="border-orange-600 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
            disabled={resetAllToGlobal.isPending}
            data-testid="button-reset-all-to-global"
          >
            {resetAllToGlobal.isPending ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Reset All to Global</span>
          </Button>
          <Button
            onClick={() => calculateSignals.mutate()}
            disabled={calculateSignals.isPending}
            variant="outline"
            size="sm"
            className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            data-testid="button-calculate-signals"
          >
            {calculateSignals.isPending ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Calculate Signals</span>
          </Button>
          <Button 
            onClick={() => { 
              window.location.href = "/formula-builder";
            }} 
            size="sm" 
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg" 
            data-testid="button-add-formula"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Formula</span>
          </Button>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle>Active Formulas</CardTitle>
          <CardDescription>Manage signal generation rules with multi-level scoping</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : formulas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No formulas created yet. Click "Add Formula" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Scope</TableHead>
                    <TableHead className="font-semibold">Condition</TableHead>
                    <TableHead className="font-semibold">Signal</TableHead>
                    <TableHead className="text-center font-semibold">Priority</TableHead>
                    <TableHead className="text-center font-semibold">Enabled</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formulas.map((formula) => (
                    <TableRow key={formula.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`row-formula-${formula.id}`}>
                      <TableCell className="font-medium">{formula.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs bg-slate-100 dark:bg-slate-800">
                          {formatScopeDisplay(formula.scope, formula.scopeValue)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-xs truncate">{formula.condition}</TableCell>
                      <TableCell>
                        <SignalBadge signal={formula.signal as "BUY" | "SELL" | "HOLD"} showIcon={false} />
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold">{formula.priority}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={formula.enabled}
                          onCheckedChange={() => handleToggle(formula)}
                          disabled={updateFormula.isPending}
                          data-testid={`switch-enable-${formula.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                data-testid={`button-test-${formula.id}`}
                                onClick={() => setTestingFormula({ formula, ticker: "" })}
                              >
                                <TestTube className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Test Excel Formula</DialogTitle>
                                <DialogDescription>
                                  Enter a ticker to test this formula
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div>
                                  <label className="text-sm font-medium mb-2 block">Ticker</label>
                                  <Input
                                    value={testingFormula?.ticker || ""}
                                    onChange={(e) => setTestingFormula(prev => prev ? { ...prev, ticker: e.target.value } : null)}
                                    placeholder="e.g., RELIANCE"
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium mb-2 block">Formula</label>
                                  <Textarea
                                    value={formula.condition}
                                    readOnly
                                    className="font-mono text-xs min-h-32"
                                  />
                                </div>
                                <Button
                                  onClick={() => {
                                    if (testingFormula?.ticker) {
                                      testExcelFormula.mutate({
                                        ticker: testingFormula.ticker,
                                        formula: formula.condition,
                                      });
                                    }
                                  }}
                                  disabled={!testingFormula?.ticker || testExcelFormula.isPending}
                                >
                                  {testExcelFormula.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Search className="h-4 w-4 mr-2" />
                                  )}
                                  Test Formula
                                </Button>
                                {testExcelFormula.data && (
                                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded">
                                    <div className="text-sm font-medium mb-2">Result:</div>
                                    <div className="font-mono text-sm">
                                      {JSON.stringify(testExcelFormula.data.result, null, 2)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-2">
                                      Type: {testExcelFormula.data.resultType}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(formula)} data-testid={`button-edit-${formula.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => handleDelete(formula)}
                            disabled={deleteFormula.isPending || replaceAndDeleteFormula.isPending}
                            data-testid={`button-delete-${formula.id}`}
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
          )}
        </CardContent>
      </Card>

      {/* Replace Main Formula Dialog */}
      <AlertDialog open={!!replacingFormula} onOpenChange={(open) => {
        if (!open) {
          setReplacingFormula(null);
          setSelectedReplacementFormulaId("");
        }
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Delete Main Formula</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You cannot delete the main (global) formula <strong>"{replacingFormula?.name}"</strong> as it is being used by all companies and sectors that don't have a specific formula assigned.
              </p>
              <p>
                To delete this formula, you must first replace it with another formula. All companies and sectors using this main formula will automatically switch to the new formula you select.
              </p>
              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium">Select replacement formula:</label>
                <Select 
                  value={selectedReplacementFormulaId} 
                  onValueChange={setSelectedReplacementFormulaId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a formula..." />
                  </SelectTrigger>
                  <SelectContent>
                    {formulas?.filter(f => f.id !== replacingFormula?.id && f.enabled).map((formula) => (
                      <SelectItem key={formula.id} value={formula.id}>
                        {formula.name} ({formula.scope === "global" ? "Global" : formula.scope})
                      </SelectItem>
                    ))}
                    {(!formulas || formulas.filter(f => f.id !== replacingFormula?.id && f.enabled).length === 0) && (
                      <SelectItem value="" disabled>No other formulas available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedReplacementFormulaId && (
                  (() => {
                    const selectedFormula = formulas?.find(f => f.id === selectedReplacementFormulaId);
                    if (selectedFormula?.scope !== "global") {
                      return (
                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                          ⚠️ Warning: The selected formula is not global. Companies and sectors without explicit formula assignments may not have a formula after replacement.
                        </p>
                      );
                    }
                    return null;
                  })()
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={replaceAndDeleteFormula.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReplaceAndDelete}
              disabled={!selectedReplacementFormulaId || replaceAndDeleteFormula.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {replaceAndDeleteFormula.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Replacing...
                </>
              ) : (
                "Replace & Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset All to Global Dialog */}
      <AlertDialog open={resetToGlobalDialogOpen} onOpenChange={setResetToGlobalDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All to Global Formula</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                This will reset all formula assignments for companies and sectors. You can either:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Clear all assignments (use "No Formula" option) - Companies and sectors will use the default global formula based on priority</li>
                <li>Assign a specific global formula to all companies and sectors</li>
              </ul>
              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium">Select global formula (or choose "No Formula" to clear assignments):</label>
                <Select
                  value={selectedGlobalFormulaId || "none"}
                  onValueChange={(value) => setSelectedGlobalFormulaId(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No Formula (use default global)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Formula (use default global)</SelectItem>
                    {formulas?.filter(f => f.scope === "global" && f.enabled).map((formula) => (
                      <SelectItem key={formula.id} value={formula.id}>
                        {formula.name} (Priority: {formula.priority})
                      </SelectItem>
                    ))}
                    {(!formulas || formulas.filter(f => f.scope === "global" && f.enabled).length === 0) && (
                      <SelectItem value="no-formulas-available" disabled>No global formulas available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedGlobalFormulaId && (
                  (() => {
                    const selectedFormula = formulas?.find(f => f.id === selectedGlobalFormulaId);
                    if (selectedFormula) {
                      return (
                        <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                          ✓ Will assign "{selectedFormula.name}" to all companies and sectors.
                        </p>
                      );
                    }
                    return null;
                  })()
                )}
                {!selectedGlobalFormulaId && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                    ✓ Will clear all formula assignments. Companies and sectors will use the default global formula based on priority.
                  </p>
                )}
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 mt-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">⚠️ Warning</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  This action will affect ALL companies and sectors. It cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetAllToGlobal.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetAllToGlobal.mutate(selectedGlobalFormulaId || null)}
              disabled={resetAllToGlobal.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {resetAllToGlobal.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Confirm Reset"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
