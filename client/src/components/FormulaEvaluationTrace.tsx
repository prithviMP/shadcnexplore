import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getFormulaEvaluationTrace } from "@/lib/queryClient";
import { FormulaTrace, getResultExplanation, formatEvaluationStep, EvaluationStep } from "@/utils/formulaTraceUtils";
import SignalBadge from "@/components/SignalBadge";
import { AlertCircle, CheckCircle2, Loader2, FileText, Code2, BarChart3 } from "lucide-react";

interface FormulaEvaluationTraceProps {
  ticker: string;
  formula: string;
  selectedQuarters?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FormulaEvaluationTrace({
  ticker,
  formula,
  selectedQuarters,
  open,
  onOpenChange,
}: FormulaEvaluationTraceProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "detailed">("summary");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/v1/formulas/evaluate-trace", ticker, formula, selectedQuarters],
    queryFn: () => getFormulaEvaluationTrace(ticker, formula, selectedQuarters),
    enabled: open && !!ticker && !!formula,
    staleTime: 30000, // Cache for 30 seconds
  });

  const trace = data?.trace;

  // Reset to summary tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab("summary");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] grid grid-rows-[auto_1fr] p-0 gap-0 [&>button]:z-10">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="w-5 h-5" />
            Formula Evaluation Trace
          </DialogTitle>
          <DialogDescription>
            Company: <strong>{ticker}</strong>
            {selectedQuarters && selectedQuarters.length > 0 && (
              <> • Quarters: {selectedQuarters.length} selected</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden px-6 pb-6">
          {isLoading && (
            <div className="flex flex-col gap-4 py-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load formula evaluation trace: {error instanceof Error ? error.message : "Unknown error"}
              </AlertDescription>
            </Alert>
          )}

          {trace && !isLoading && !error && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "summary" | "detailed")} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 flex-shrink-0 mb-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="detailed">Detailed</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden">
                <SummaryView trace={trace} />
              </TabsContent>

              <TabsContent value="detailed" className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden">
                <DetailedView trace={trace} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryView({ trace }: { trace: FormulaTrace }) {
  const explanation = getResultExplanation(trace.result, trace);

  return (
    <div className="h-full overflow-y-auto pr-4">
      <div className="space-y-4">
        {/* Result Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Evaluation Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Signal:</span>
              <SignalBadge signal={String(trace.result)} />
            </div>
            <div className="text-sm text-muted-foreground">
              {explanation}
            </div>
            {trace.evaluationTime > 0 && (
              <div className="text-xs text-muted-foreground">
                Evaluation time: {trace.evaluationTime}ms
              </div>
            )}
          </CardContent>
        </Card>

        {/* Original Formula */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Original Formula
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">
              {trace.originalFormula}
            </div>
          </CardContent>
        </Card>

        {/* Formula with Substitutions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Formula with Values
            </CardTitle>
            <CardDescription>
              Original metric references replaced with actual database values
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">
              {trace.formulaWithSubstitutions}
            </div>
          </CardContent>
        </Card>

        {/* Metric Substitutions */}
        {trace.substitutions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metric Values Used</CardTitle>
              <CardDescription>
                Database values substituted into the formula
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {trace.substitutions.map((sub, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{sub.original}</code>
                      <span className="text-muted-foreground">→</span>
                      {sub.value !== null ? (
                        <span className="font-semibold">{sub.value}</span>
                      ) : (
                        <Badge variant="outline" className="text-xs">null</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sub.quarter} {sub.normalized && "(normalized)"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Used Quarters */}
        {trace.usedQuarters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quarters Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {trace.usedQuarters.map((quarter, idx) => (
                  <Badge key={idx} variant="outline">
                    {quarter}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DetailedView({ trace }: { trace: FormulaTrace }) {
  const typeIcons: Record<EvaluationStep['type'], typeof AlertCircle> = {
    metric_lookup: BarChart3,
    function_call: Code2,
    comparison: AlertCircle,
    arithmetic: Code2,
    logical: Code2,
    unary: Code2,
  };

  const typeBorderColors: Record<EvaluationStep['type'], string> = {
    metric_lookup: "#3b82f6", // blue-500
    function_call: "#a855f7", // purple-500
    comparison: "#f97316", // orange-500
    arithmetic: "#22c55e", // green-500
    logical: "#ec4899", // pink-500
    unary: "#06b6d4", // cyan-500
  };

  const typeColors: Record<EvaluationStep['type'], string> = {
    metric_lookup: "text-blue-600 dark:text-blue-400",
    function_call: "text-purple-600 dark:text-purple-400",
    comparison: "text-orange-600 dark:text-orange-400",
    arithmetic: "text-green-600 dark:text-green-400",
    logical: "text-pink-600 dark:text-pink-400",
    unary: "text-cyan-600 dark:text-cyan-400",
  };

  return (
    <div className="h-full overflow-y-auto pr-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Evaluation Steps ({trace.steps.length})</h3>
          <Badge variant="outline">{trace.evaluationTime}ms</Badge>
        </div>

        {trace.steps.length === 0 && (
          <Alert>
            <AlertDescription>No evaluation steps recorded.</AlertDescription>
          </Alert>
        )}

        {trace.steps.map((step, idx) => {
          const Icon = typeIcons[step.type] || AlertCircle;
          const colorClass = typeColors[step.type] || "text-gray-600";
          const borderColor = typeBorderColors[step.type] || "#6b7280";

          return (
            <Card key={idx} className="border-l-4" style={{ borderLeftColor: borderColor }}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 ${colorClass}`} />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{step.type}</Badge>
                      <span className="text-sm font-medium">{step.description}</span>
                    </div>

                    {step.input && (
                      <div className="text-xs text-muted-foreground">
                        <strong>Input:</strong>{" "}
                        <code className="bg-muted px-1 py-0.5 rounded">
                          {typeof step.input === 'object' ? JSON.stringify(step.input, null, 2) : String(step.input)}
                        </code>
                      </div>
                    )}

                    {step.output && (
                      <div className="text-xs">
                        <strong>Output:</strong>{" "}
                        <code className="bg-muted px-1 py-0.5 rounded font-semibold">
                          {typeof step.output === 'object' ? JSON.stringify(step.output, null, 2) : String(step.output)}
                        </code>
                      </div>
                    )}

                    {step.metadata && Object.keys(step.metadata).length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Metadata
                        </summary>
                        <pre className="mt-1 bg-muted p-2 rounded text-xs overflow-x-auto">
                          {JSON.stringify(step.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
