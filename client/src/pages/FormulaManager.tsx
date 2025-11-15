import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TestTube, Loader2, Play } from "lucide-react";
import SignalBadge from "@/components/SignalBadge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertFormulaSchema, type Formula } from "@shared/schema";
import { z } from "zod";

const formulaFormSchema = insertFormulaSchema.extend({
  scopeValue: z.string().optional().nullable(),
});

type FormulaFormData = z.infer<typeof formulaFormSchema>;

export default function FormulaManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);
  const { toast } = useToast();

  const { data: formulas = [], isLoading } = useQuery<Formula[]>({
    queryKey: ["/api/formulas"],
  });

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
    mutationFn: async (data: FormulaFormData) => 
      apiRequest("POST", "/api/formulas", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulas"] });
      toast({ title: "Formula created successfully" });
      setDialogOpen(false);
      form.reset();
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
      toast({ title: "Formula deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete formula", 
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

  const handleToggle = (formula: Formula) => {
    updateFormula.mutate({ 
      id: formula.id, 
      data: { enabled: !formula.enabled } 
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this formula?")) {
      deleteFormula.mutate(id);
    }
  };

  const handleEdit = (formula: Formula) => {
    setEditingFormula(formula);
    form.reset({
      name: formula.name,
      scope: formula.scope,
      scopeValue: formula.scopeValue,
      condition: formula.condition,
      signal: formula.signal,
      priority: formula.priority,
      enabled: formula.enabled,
    });
    setDialogOpen(true);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Formula Manager
          </h1>
          <p className="text-muted-foreground mt-1">Define and manage signal generation formulas</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => calculateSignals.mutate()} 
            disabled={calculateSignals.isPending}
            variant="outline"
            className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            data-testid="button-calculate-signals"
          >
            {calculateSignals.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Calculate Signals
          </Button>
          <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingFormula(null); form.reset(); }} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg" data-testid="button-add-formula">
                <Plus className="h-4 w-4 mr-2" />
                Add Formula
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-xl">{editingFormula ? "Edit Formula" : "Create New Formula"}</DialogTitle>
              <DialogDescription>Define the conditions for signal generation</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Formula Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., High ROE Stocks" className="h-11" data-testid="input-formula-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scope"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium">Scope</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11" data-testid="select-scope">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="global">Global</SelectItem>
                            <SelectItem value="sector">Sector</SelectItem>
                            <SelectItem value="company">Company</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="signal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium">Signal Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11" data-testid="select-signal">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BUY">BUY</SelectItem>
                            <SelectItem value="SELL">SELL</SelectItem>
                            <SelectItem value="HOLD">HOLD</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="scopeValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Scope Value (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="e.g., Technology (for sector-specific formulas)" className="h-11" data-testid="input-scope-value" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Required for sector/company scoped formulas
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Formula Condition</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="e.g., ROE > 20 AND PE < 15"
                          className="font-mono text-sm min-h-24 bg-slate-50 dark:bg-slate-900/50"
                          rows={4}
                          data-testid="input-condition"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Use metrics like ROE, PE, PEG, Revenue_Growth, Debt_to_Equity, etc.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Priority (lower = higher priority)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" onChange={e => field.onChange(parseInt(e.target.value))} className="h-11" data-testid="input-priority" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                  <Button 
                    type="submit" 
                    disabled={createFormula.isPending || updateFormula.isPending}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" 
                    data-testid="button-save-formula"
                  >
                    {(createFormula.isPending || updateFormula.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Formula
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
                          {formula.scope}
                          {formula.scopeValue && `: ${formula.scopeValue}`}
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
                          <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-test-${formula.id}`}>
                            <TestTube className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(formula)} data-testid={`button-edit-${formula.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" 
                            onClick={() => handleDelete(formula.id)} 
                            disabled={deleteFormula.isPending}
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
    </div>
  );
}
