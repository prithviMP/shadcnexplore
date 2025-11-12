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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Real-time overview of your financial screening data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Card className="relative bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-total-companies">{MOCK_STATS.totalCompanies}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all sectors</p>
            </CardContent>
          </Card>
        </div>

        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Card className="relative bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Signals</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-active-signals">{MOCK_STATS.activeSignals}</div>
              <p className="text-xs text-muted-foreground mt-1">BUY or SELL signals</p>
            </CardContent>
          </Card>
        </div>

        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Card className="relative bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sectors</CardTitle>
              <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-sectors">{MOCK_STATS.sectors}</div>
              <p className="text-xs text-muted-foreground mt-1">Industry classifications</p>
            </CardContent>
          </Card>
        </div>

        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Card className="relative bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Last Update</CardTitle>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-last-update">{MOCK_STATS.lastUpdate}</div>
              <p className="text-xs text-muted-foreground mt-1">Data refresh time</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Sectors Overview</CardTitle>
            <CardDescription>Signal distribution by industry sector</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOCK_SECTORS.map((sector) => (
                <Link key={sector.name} href={`/sectors/${sector.name.toLowerCase()}`}>
                  <div className="group p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 cursor-pointer bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm" data-testid={`card-sector-${sector.name.toLowerCase()}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-lg">{sector.name}</h4>
                      <span className="text-sm text-muted-foreground">{sector.companies} companies</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1.5">
                        <SignalBadge signal="BUY" showIcon={false} />
                        <span className="text-sm font-medium text-muted-foreground">{sector.buySignals}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <SignalBadge signal="SELL" showIcon={false} />
                        <span className="text-sm font-medium text-muted-foreground">{sector.sellSignals}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <SignalBadge signal="HOLD" showIcon={false} />
                        <span className="text-sm font-medium text-muted-foreground">{sector.holdSignals}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest generated trading signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOCK_RECENT_SIGNALS.map((item) => (
                <Link key={item.ticker} href={`/company/${item.ticker}`}>
                  <div className="group p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 cursor-pointer bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm" data-testid={`signal-${item.ticker.toLowerCase()}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-mono font-bold text-lg">{item.ticker}</div>
                        <div className="text-sm text-muted-foreground">{item.company}</div>
                      </div>
                      <SignalBadge signal={item.signal} />
                    </div>
                    <div className="text-xs font-mono text-muted-foreground bg-slate-100 dark:bg-slate-800/50 p-2 rounded truncate">
                      {item.formula}
                    </div>
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
