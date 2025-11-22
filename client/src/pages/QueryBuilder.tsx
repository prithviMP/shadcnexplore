import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, Save, Loader2, BookOpen, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  _formulaResult?: string | number | boolean | null;
}

const EXAMPLE_QUERIES = [
  {
    name: "High ROE Companies",
    query: "ROE > 20",
    description: "Companies with ROE greater than 20%"
  },
  {
    name: "Low P/E Ratio",
    query: "P/E < 15",
    description: "Companies with P/E ratio less than 15"
  },
  {
    name: "IT Sector",
    query: 'Sector = "IT"',
    description: "Companies in IT sector"
  },
  {
    name: "High Growth & Low Debt",
    query: "AND(ROE > 25, Debt < 30)",
    description: "High ROE and low debt ratio"
  },
  {
    name: "IT or Banking",
    query: 'OR(Sector = "IT", Sector = "Banking")',
    description: "Companies in IT or Banking sectors"
  },
  {
    name: "High Revenue",
    query: "Revenue > 1000",
    description: "Companies with revenue greater than 1000"
  },
  {
    name: "Excel Formula - Main Signal",
    query: 'IF(OR(NOT(ISNUMBER(Q12)), NOT(ISNUMBER(Q13)), NOT(ISNUMBER(Q14)), NOT(ISNUMBER(Q15)), NOT(ISNUMBER(Q16)), NOT(ISNUMBER(P12)), NOT(ISNUMBER(P13)), NOT(ISNUMBER(P14)), NOT(ISNUMBER(P15)), NOT(ISNUMBER(P16))), "No Signal", IF(AND(Q14>0, P14>0, Q12>=20%, Q15>=20%, OR(AND(MIN(Q13,Q16)>=5%, OR(Q13>=10%, Q16>=10%)), AND(Q16>=5%, Q16<10%, Q13>=100%), AND(Q13<0, Q16>=10%)), AND(P12>=10%, OR(AND(P13>0, P15>0), AND(P13>0, P16>0), AND(P15>0, P16>0))), OR(P16>=0, P13>=10%), OR(P13>=0, P16>=10%), OR(P15>=0, AND(P15<0, Q13>=0, Q16>=0))), "BUY", IF(OR(AND(P13<10%, Q13<10%, Q15<P15, Q16<P16), AND(Q13<0, Q16<0), AND(Q16<0, Q15<0, OR(Q13<0, Q12<10%)), AND(OR(Q13<5%, Q16<5%), OR(IF(ABS(P12)>0, (Q12 - P12)/ABS(P12) <= -15%, Q12<0), IF(ABS(P15)>0, (Q15 - P15)/ABS(P15) <= -15%, Q15<0))), AND(Q12<20%, Q13<5%)), "Check_OPM (Sell)", "No Signal")))',
    description: "Complex Excel formula using Q12-Q16 (current quarter) and P12-P16 (previous quarter) metrics"
  },
];

export default function QueryBuilder() {
  const { toast } = useToast();
  const [query, setQuery] = useState("ROE > 20");
  const [results, setResults] = useState<QueryExecutionResult[]>([]);
  const [queryName, setQueryName] = useState("");
  const [totalResults, setTotalResults] = useState(0);
  const [showExamples, setShowExamples] = useState(false);

  const executeMutation = useMutation({
    mutationFn: async (queryText: string) => {
      const res = await apiRequest("POST", "/api/v1/queries/execute", {
        query: queryText,
        limit: 100,
        offset: 0
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data.results || []);
      setTotalResults(data.total || 0);
      toast({
        title: "Query executed",
        description: `Found ${data.total || 0} matching companies`,
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
      if (!query.trim()) {
        throw new Error("Please enter a query");
      }
      const res = await apiRequest("POST", "/api/v1/queries", {
        name: queryName,
        description: `Excel query: ${query}`,
        query: query,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Query saved",
        description: "Your query has been saved successfully",
      });
      setQueryName("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/queries"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const executeQuery = () => {
    if (!query.trim()) {
      toast({
        title: "Query required",
        description: "Please enter a query to execute",
        variant: "destructive",
      });
      return;
    }
    executeMutation.mutate(query);
  };

  const saveQuery = () => {
    saveMutation.mutate();
  };

  const loadExample = (exampleQuery: string) => {
    setQuery(exampleQuery);
    setShowExamples(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Excel Query Builder
          </h1>
          <p className="text-muted-foreground mt-1">
            Write Excel-like queries to filter financial data
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showExamples} onOpenChange={setShowExamples}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Examples
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Example Queries</DialogTitle>
                <DialogDescription>
                  Click on any example to load it into the query editor
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {EXAMPLE_QUERIES.map((example, idx) => (
                  <Card
                    key={idx}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => loadExample(example.query)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">{example.name}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{example.description}</p>
                          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                            {example.query}
                          </code>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
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
            disabled={saveMutation.isPending || !queryName.trim() || !query.trim()}
            data-testid="button-save-query"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Query
          </Button>
          <Button
            onClick={executeQuery}
            disabled={executeMutation.isPending || !query.trim()}
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
          <CardTitle>Write Query</CardTitle>
          <CardDescription>
            Use Excel-like syntax to filter companies. Examples: <code className="text-xs">ROE &gt; 20</code>, <code className="text-xs">AND(ROE &gt; 25, P/E &lt; 15)</code>
            <br />
            <span className="text-xs text-muted-foreground mt-1 block">
              Excel formulas: Use Q12-Q16 (current quarter) and P12-P16 (previous quarter) metrics. Supports IF(), AND(), OR(), NOT(), ISNUMBER(), MIN(), ABS()
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Enter Excel-like query, e.g., ROE > 20 or AND(ROE > 25, P/E < 15)'
              className="min-h-[120px] font-mono text-sm"
              data-testid="textarea-query"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex gap-4">
                <span>
                  <strong>Fields:</strong> Ticker, Company, Sector, Revenue, ROE, P/E, Debt, Signal
                </span>
              </div>
              <div className="flex gap-4">
                <span>
                  <strong>Operators:</strong> =, &gt;, &lt;, &gt;=, &lt;=, &lt;&gt;
                </span>
                <span>
                  <strong>Functions:</strong> AND(), OR(), IF()
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {executeMutation.isError && (
        <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <X className="h-4 w-4" />
              <span className="font-semibold">Query Error:</span>
              <span>{(executeMutation.error as Error)?.message || "Unknown error"}</span>
            </div>
          </CardContent>
        </Card>
      )}

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
                        {row.revenue !== null ? (() => {
                          const val = row.revenue;
                          if (Math.abs(val) >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
                          if (Math.abs(val) >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
                          if (Math.abs(val) >= 1000) return `₹${(val / 1000).toFixed(2)} K`;
                          return `₹${val.toFixed(2)}`;
                        })() : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {row.roe !== null ? `${row.roe.toFixed(1)}%` : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.pe !== null ? row.pe.toFixed(1) : "N/A"}
                      </TableCell>
                      <TableCell>
                        {row._formulaResult !== undefined ? (
                          <Badge
                            variant="outline"
                            className={
                              row._formulaResult === "BUY" || row._formulaResult === true ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800" :
                                row._formulaResult === "SELL" || (typeof row._formulaResult === 'string' && row._formulaResult.includes("Sell")) ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" :
                                  "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            }
                          >
                            {String(row._formulaResult)}
                          </Badge>
                        ) : row.latestSignal ? (
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
