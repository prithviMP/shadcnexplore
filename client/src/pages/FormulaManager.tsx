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
import { Plus, Pencil, Trash2, Loader2, Play, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertFormulaSchema, type Formula, type Company, type Sector } from "@shared/schema";
import { z } from "zod";

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
  const [replacingFormula, setReplacingFormula] = useState<Formula | null>(null);
  const [selectedReplacementFormulaId, setSelectedReplacementFormulaId] = useState<string>("");
  const [resetToGlobalDialogOpen, setResetToGlobalDialogOpen] = useState(false);
  const [selectedGlobalFormulaId, setSelectedGlobalFormulaId] = useState<string>("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
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

  // Determine the active global formula (using isActiveGlobal flag)
  const activeGlobalFormula = useMemo(() => {
    return formulas.find(f => f.scope === "global" && f.enabled && f.isActiveGlobal) || null;
  }, [formulas]);

  // Count companies using each formula
  const formulaUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    formulas.forEach(formula => {
      let count = 0;
      
      // Count companies with this formula directly assigned
      const companiesWithFormula = companies.filter(c => c.assignedFormulaId === formula.id);
      count += companiesWithFormula.length;
      
      // Count companies in sectors with this formula assigned (that don't have their own override)
      const sectorsWithFormula = sectors.filter(s => s.assignedFormulaId === formula.id);
      sectorsWithFormula.forEach(sector => {
        const sectorCompanies = companies.filter(c => 
          c.sectorId === sector.id && !c.assignedFormulaId
        );
        count += sectorCompanies.length;
      });
      
      // For active global formula, count companies/sectors without specific assignments
      if (formula.scope === "global" && formula.enabled && formula.id === activeGlobalFormula?.id) {
        // Count companies without any formula assignment
        const companiesWithoutFormula = companies.filter(c => !c.assignedFormulaId);
        
        // For each company without formula, check if its sector also doesn't have a formula
        companiesWithoutFormula.forEach(company => {
          const sector = sectors.find(s => s.id === company.sectorId);
          if (!sector || !sector.assignedFormulaId) {
            count++;
          }
        });
      }
      
      counts[formula.id] = count;
    });
    
    return counts;
  }, [formulas, companies, sectors, activeGlobalFormula]);

  // Sort formulas
  const sortedFormulas = useMemo(() => {
    const sorted = [...formulas];
    
    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortField) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "scope":
          aValue = formatScopeDisplay(a.scope, a.scopeValue).toLowerCase();
          bValue = formatScopeDisplay(b.scope, b.scopeValue).toLowerCase();
          break;
        case "companies":
          aValue = formulaUsageCounts[a.id] || 0;
          bValue = formulaUsageCounts[b.id] || 0;
          break;
        case "signal":
          aValue = (a.signal || "").toLowerCase();
          bValue = (b.signal || "").toLowerCase();
          break;
        case "priority":
          aValue = a.priority;
          bValue = b.priority;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [formulas, sortField, sortDirection, formulaUsageCounts]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

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


  const form = useForm<FormulaFormData>({
    resolver: zodResolver(formulaFormSchema),
    defaultValues: {
      name: "",
      scope: "global",
      scopeValue: null,
      condition: "",
      signal: "", // Formulas return signals dynamically, so signal field is not used
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
    onSuccess: async (data: { companiesAffected: number; sectorsAffected: number; message: string }) => {
      // Invalidate and refetch to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      // Refetch formulas to get updated priorities
      await queryClient.refetchQueries({ queryKey: ["/api/formulas"] });
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
    mutationFn: async (incremental?: boolean) => {
      // First, ensure we have the latest formulas from the server
      await queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      await queryClient.refetchQueries({ queryKey: ["/api/formulas"] });
      
      // Then calculate signals using all enabled formulas - use same logic as Dashboard refresh
      const res = await apiRequest("POST", "/api/signals/calculate", {
        incremental: incremental ?? false,
        async: true,
        batchSize: 50,
      });
      return res.json();
    },
    onSuccess: (data: { jobId?: string; signalsGenerated?: number }) => {
      // Use same logic as Dashboard refresh - show job queued message
      if (data.jobId) {
        toast({
          title: "Signal calculation started",
          description: `Job ${data.jobId} has been queued. Signals will be updated in the background.`,
        });
        // Refetch signal status after a short delay
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/signals/status"] });
        }, 2000);
      } else {
        // Fallback for synchronous response (shouldn't happen with async: true)
        toast({
          title: "Signals calculated successfully",
          description: `Generated ${data.signalsGenerated || 0} signal${(data.signalsGenerated || 0) !== 1 ? 's' : ''} using all enabled formulas`
        });
        // Invalidate all signal-related queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/v1/companies"] });
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      }
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
    onSuccess: async (data: { companiesAffected: number; sectorsAffected: number; message: string }) => {
      // Invalidate and refetch to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      // Refetch formulas to get updated priorities
      await queryClient.refetchQueries({ queryKey: ["/api/formulas"] });
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
      // For global formulas, include type=global in the URL
      window.location.href = `/formula-builder?type=global&formulaId=${formula.id}`;
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
            onClick={() => {
              // Pre-select the active global formula
              if (activeGlobalFormula) {
                setSelectedGlobalFormulaId(activeGlobalFormula.id);
              } else {
                setSelectedGlobalFormulaId("");
              }
              setResetToGlobalDialogOpen(true);
            }}
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
            onClick={() => calculateSignals.mutate(false)}
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
                    <TableHead 
                      className="font-semibold cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center">
                        Name
                        <SortIcon field="name" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("scope")}
                    >
                      <div className="flex items-center">
                        Scope
                        <SortIcon field="scope" />
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold">Condition</TableHead>
                    <TableHead 
                      className="text-center font-semibold cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("companies")}
                    >
                      <div className="flex items-center justify-center">
                        Companies
                        <SortIcon field="companies" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("signal")}
                    >
                      <div className="flex items-center">
                        Signal
                        <SortIcon field="signal" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-semibold">Enabled</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFormulas.map((formula) => {
                    const isActiveGlobal = formula.scope === "global" && formula.id === activeGlobalFormula?.id;
                    return (
                      <TableRow key={formula.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`row-formula-${formula.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {formula.name}
                            {isActiveGlobal && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-blue-600">
                                Active Global
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs bg-slate-100 dark:bg-slate-800">
                            {formatScopeDisplay(formula.scope, formula.scopeValue)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-xs truncate">{formula.condition}</TableCell>
                        <TableCell className="text-center">
                          {formulaUsageCounts[formula.id] || 0}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {formula.signal || "—"}
                          </Badge>
                        </TableCell>
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
                    );
                  })}
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
