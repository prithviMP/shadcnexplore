import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, Layers, Clock } from "lucide-react";
import SignalBadge from "@/components/SignalBadge";
import { Link } from "wouter";

//todo: remove mock functionality
const MOCK_STATS = {
  totalCompanies: 1247,
  activeSignals: 89,
  sectors: 12,
  lastUpdate: "2 hours ago"
};

const MOCK_SECTORS = [
  { name: "Technology", companies: 156, buySignals: 23, sellSignals: 12, holdSignals: 121 },
  { name: "Healthcare", companies: 98, buySignals: 15, sellSignals: 8, holdSignals: 75 },
  { name: "Finance", companies: 134, buySignals: 19, sellSignals: 14, holdSignals: 101 },
  { name: "Energy", companies: 76, buySignals: 8, sellSignals: 18, holdSignals: 50 },
  { name: "Consumer", companies: 112, buySignals: 16, sellSignals: 9, holdSignals: 87 },
  { name: "Industrial", companies: 89, buySignals: 11, sellSignals: 7, holdSignals: 71 },
];

const MOCK_RECENT_SIGNALS = [
  { ticker: "AAPL", company: "Apple Inc.", sector: "Technology", signal: "BUY" as const, formula: "ROE > 20% AND PEG < 1.5" },
  { ticker: "MSFT", company: "Microsoft Corp.", sector: "Technology", signal: "BUY" as const, formula: "Revenue Growth > 15%" },
  { ticker: "TSLA", company: "Tesla Inc.", sector: "Consumer", signal: "SELL" as const, formula: "PE Ratio > 50" },
  { ticker: "JNJ", company: "Johnson & Johnson", sector: "Healthcare", signal: "HOLD" as const, formula: "Debt to Equity < 0.5" },
  { ticker: "JPM", company: "JPMorgan Chase", sector: "Finance", signal: "BUY" as const, formula: "Dividend Yield > 3%" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your financial screening data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" data-testid="text-total-companies">{MOCK_STATS.totalCompanies}</div>
            <p className="text-xs text-muted-foreground">Across all sectors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Signals</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" data-testid="text-active-signals">{MOCK_STATS.activeSignals}</div>
            <p className="text-xs text-muted-foreground">BUY or SELL signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sectors</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" data-testid="text-sectors">{MOCK_STATS.sectors}</div>
            <p className="text-xs text-muted-foreground">Industry classifications</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Update</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" data-testid="text-last-update">{MOCK_STATS.lastUpdate}</div>
            <p className="text-xs text-muted-foreground">Data refresh time</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sectors Overview</CardTitle>
            <CardDescription>Signal distribution by sector</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOCK_SECTORS.map((sector) => (
                <Link key={sector.name} href={`/sectors/${sector.name.toLowerCase()}`}>
                  <div className="p-3 rounded-md hover-elevate active-elevate-2 border cursor-pointer" data-testid={`card-sector-${sector.name.toLowerCase()}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{sector.name}</h4>
                      <span className="text-sm text-muted-foreground">{sector.companies} companies</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1">
                        <SignalBadge signal="BUY" showIcon={false} />
                        <span className="text-xs text-muted-foreground">{sector.buySignals}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <SignalBadge signal="SELL" showIcon={false} />
                        <span className="text-xs text-muted-foreground">{sector.sellSignals}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <SignalBadge signal="HOLD" showIcon={false} />
                        <span className="text-xs text-muted-foreground">{sector.holdSignals}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest generated signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOCK_RECENT_SIGNALS.map((item) => (
                <Link key={item.ticker} href={`/company/${item.ticker}`}>
                  <div className="p-3 rounded-md hover-elevate active-elevate-2 border cursor-pointer" data-testid={`signal-${item.ticker.toLowerCase()}`}>
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <div className="font-mono font-medium">{item.ticker}</div>
                        <div className="text-sm text-muted-foreground">{item.company}</div>
                      </div>
                      <SignalBadge signal={item.signal} />
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate">{item.formula}</div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
