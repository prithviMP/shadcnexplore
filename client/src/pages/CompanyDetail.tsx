import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import SignalBadge from "@/components/SignalBadge";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Company, Sector, Signal } from "@shared/schema";
import { format } from "date-fns";

const formatCurrency = (value: number): string => {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;

const FINANCIAL_FIELDS = [
  { key: "revenue", label: "Revenue", formatter: formatCurrency },
  { key: "netIncome", label: "Net Income", formatter: formatCurrency },
  { key: "roe", label: "ROE", formatter: formatPercent },
  { key: "pe", label: "P/E Ratio", formatter: (v: number) => v.toFixed(2) },
  { key: "debt", label: "Debt Ratio", formatter: (v: number) => v.toFixed(2) },
  { key: "marketCap", label: "Market Cap", formatter: formatCurrency }
];

export default function CompanyDetail() {
  const [match, params] = useRoute("/company/:ticker");
  const ticker = params?.ticker?.toUpperCase();

  const { data: company, isLoading: companyLoading, error: companyError } = useQuery<Company>({
    queryKey: ["/api/companies/ticker", ticker],
    enabled: !!ticker
  });

  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  const { data: signals, isLoading: signalsLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals", { companyId: company?.id }],
    enabled: !!company?.id
  });

  if (!match || !ticker) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Invalid company ticker</AlertDescription>
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
    if (!financialData) return null;
    if (key === "marketCap" && company.marketCap) return parseFloat(company.marketCap);
    return financialData[key] !== undefined ? Number(financialData[key]) : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/company-manager">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-mono" data-testid="text-ticker">
              {company.ticker}
            </h1>
            {latestSignal && <SignalBadge signal={latestSignal.signal as "BUY" | "SELL" | "HOLD"} />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground" data-testid="text-company-name">{company.name}</p>
            <Badge variant="outline" data-testid="badge-sector">{sectorName}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {FINANCIAL_FIELDS.map(({ key, label, formatter }) => {
          const value = getFinancialValue(key);
          return (
            <Card key={key} data-testid={`card-${key}`}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">{label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {value !== null ? formatter(value) : "—"}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
                {latestSignal.metadata && typeof latestSignal.metadata === 'object' && (
                  <div className="p-3 bg-muted rounded-md">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(latestSignal.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
              <ScrollArea className="h-[300px] pr-4">
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
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {!financialData && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No financial data available for this company. Update the company in the Company Manager to add financial metrics.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
