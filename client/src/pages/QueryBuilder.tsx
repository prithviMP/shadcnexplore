import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Play, Save, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface QueryCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic: "AND" | "OR";
}

interface QueryExecutionResult {
  ticker: string;
  name: string;
  sectorName: string;
  revenue: number | null;
  netIncome: number | null;
  roe: number | null;
  pe: number | null;
  debt: number | null;
  marketCap: string | null;
  latestSignal: string | null;
  latestSignalDate: string | null;
}

const AVAILABLE_FIELDS = [
  { value: "ticker", label: "Ticker" },
  { value: "sector", label: "Sector" },
  { value: "revenue", label: "Revenue" },
  { value: "netIncome", label: "Net Income" },
  { value: "roe", label: "ROE %" },
  { value: "pe", label: "P/E Ratio" },
  { value: "debt", label: "Debt Ratio" },
  { value: "signal", label: "Signal" },
];

const OPERATORS = [
  { value: "=", label: "Equals" },
  { value: ">", label: "Greater than" },
  { value: "<", label: "Less than" },
  { value: ">=", label: "Greater or equal" },
  { value: "<=", label: "Less or equal" },
  { value: "contains", label: "Contains" },
];

export default function QueryBuilder() {
  const { toast } = useToast();
  const [conditions, setConditions] = useState<QueryCondition[]>([
    { id: "1", field: "roe", operator: ">", value: "20", logic: "AND" }
  ]);
  const [results, setResults] = useState<QueryExecutionResult[]>([]);
  const [queryName, setQueryName] = useState("");
  const [totalResults, setTotalResults] = useState(0);

  const executeMutation = useMutation({
    mutationFn: async (conditions: QueryCondition[]) => {
      const res = await apiRequest("POST", "/api/queries/execute", { conditions });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data.results);
      setTotalResults(data.total);
      toast({
        title: "Query executed",
        description: `Found ${data.total} matching companies`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Execution failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!queryName.trim()) {
        throw new Error("Please enter a query name");
      }
      const res = await apiRequest("POST", "/api/queries", {
        name: queryName,
        description: `Query with ${conditions.length} conditions`,
        criteria: conditions,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Query saved",
        description: "Your query has been saved successfully",
      });
      setQueryName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addCondition = () => {
    const newCondition: QueryCondition = {
      id: Date.now().toString(),
      field: "ticker",
      operator: "=",
      value: "",
      logic: "AND"
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, field: keyof QueryCondition, value: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const executeQuery = () => {
    executeMutation.mutate(conditions);
  };

  const saveQuery = () => {
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Query Builder
          </h1>
          <p className="text-muted-foreground mt-1">Build custom queries to filter financial data</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Query name..."
            value={queryName}
            onChange={(e) => setQueryName(e.target.value)}
            className="w-48"
            data-testid="input-query-name"
          />
          <Button 
            variant="outline" 
            onClick={saveQuery} 
            disabled={saveMutation.isPending || !queryName.trim()}
            data-testid="button-save-query"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Query
          </Button>
          <Button 
            onClick={executeQuery} 
            disabled={executeMutation.isPending}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg" 
            data-testid="button-execute-query"
          >
            {executeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Execute
          </Button>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle>Build Query</CardTitle>
          <CardDescription>Add conditions to filter companies based on financial metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conditions.map((condition, index) => (
            <div key={condition.id} className="space-y-3">
              {index > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="uppercase text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {condition.logic}
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white/50 dark:bg-slate-800/30 backdrop-blur-sm" data-testid={`condition-${index}`}>
                <Select
                  value={condition.field}
                  onValueChange={(value) => updateCondition(condition.id, "field", value)}
                >
                  <SelectTrigger className="w-[180px] h-11" data-testid={`select-field-${index}`}>
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={condition.operator}
                  onValueChange={(value) => updateCondition(condition.id, "operator", value)}
                >
                  <SelectTrigger className="w-[160px] h-11" data-testid={`select-operator-${index}`}>
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={condition.value}
                  onChange={(e) => updateCondition(condition.id, "value", e.target.value)}
                  placeholder="Value"
                  className="flex-1 h-11"
                  data-testid={`input-value-${index}`}
                />

                {index > 0 && (
                  <Select
                    value={condition.logic}
                    onValueChange={(value) => updateCondition(condition.id, "logic", value as "AND" | "OR")}
                  >
                    <SelectTrigger className="w-[100px] h-11" data-testid={`select-logic-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeCondition(condition.id)}
                  className="h-11 w-11"
                  data-testid={`button-remove-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addCondition} className="w-full" data-testid="button-add-condition">
            <Plus className="h-4 w-4 mr-2" />
            Add Condition
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
          <CardHeader>
            <CardTitle>Query Results</CardTitle>
            <CardDescription>
              {results.length} of {totalResults} companies match your criteria
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="font-semibold">Ticker</TableHead>
                    <TableHead className="font-semibold">Company</TableHead>
                    <TableHead className="font-semibold">Sector</TableHead>
                    <TableHead className="text-right font-mono font-semibold">Revenue (B)</TableHead>
                    <TableHead className="text-right font-mono font-semibold">ROE %</TableHead>
                    <TableHead className="text-right font-mono font-semibold">P/E</TableHead>
                    <TableHead className="font-semibold">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row.ticker} className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`result-${row.ticker.toLowerCase()}`}>
                      <TableCell className="font-mono font-semibold">{row.ticker}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.sectorName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.revenue !== null ? `$${row.revenue.toFixed(2)}` : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {row.roe !== null ? `${row.roe.toFixed(1)}%` : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.pe !== null ? row.pe.toFixed(1) : "N/A"}
                      </TableCell>
                      <TableCell>
                        {row.latestSignal ? (
                          <Badge 
                            variant={row.latestSignal === "BUY" ? "default" : "secondary"} 
                            className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          >
                            {row.latestSignal}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No signal</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
