import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, TrendingUp, Layers, Clock } from "lucide-react";
import SignalBadge from "@/components/SignalBadge";
import { Link } from "wouter";
import type { Company, Sector, Signal } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { useMemo } from "react";

export default function Dashboard() {
  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: sectors, isLoading: sectorsLoading } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
  });

  const { data: allSignals, isLoading: signalsLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
  });

  const isLoading = companiesLoading || sectorsLoading || signalsLoading;

  // Calculate stats from real data
  const stats = {
    totalCompanies: companies?.length || 0,
    activeSignals: allSignals?.filter(s => s.signal !== "HOLD").length || 0,
    sectors: sectors?.length || 0,
    lastUpdate: companies && companies.length > 0 
      ? formatDistanceToNow(new Date(Math.max(...companies.map(c => new Date(c.updatedAt).getTime()))), { addSuffix: true })
      : "Never"
  };

  // Get sector overview with signal counts
  const sectorOverview = sectors?.map(sector => {
    const sectorCompanies = companies?.filter(c => c.sectorId === sector.id) || [];
    const sectorSignals = allSignals?.filter(signal => 
      sectorCompanies.some(c => c.id === signal.companyId)
    ) || [];

    return {
      id: sector.id,
      name: sector.name,
      companies: sectorCompanies.length,
      buySignals: sectorSignals.filter(s => s.signal === "BUY").length,
      sellSignals: sectorSignals.filter(s => s.signal === "SELL").length,
      holdSignals: sectorSignals.filter(s => s.signal === "HOLD").length,
    };
  }) || [];

  // Get recent signals (only include signals with valid companies)
  const recentSignals = allSignals
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(signal => {
      const company = companies?.find(c => c.id === signal.companyId);
      if (!company) return null; // Skip signals without valid companies
      
      const sector = sectors?.find(s => s.id === company.sectorId);
      return {
        ticker: company.ticker,
        company: company.name,
        sector: sector?.name || "Unknown",
        signal: signal.signal as "BUY" | "SELL" | "HOLD",
        metadata: signal.metadata
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null) // Remove null entries
    .slice(0, 5) || [];

  // Calculate signal distribution for charts
  const signalDistribution = useMemo(() => {
    if (!allSignals) return { buy: 0, sell: 0, hold: 0 };
    
    return {
      buy: allSignals.filter(s => s.signal === "BUY").length,
      sell: allSignals.filter(s => s.signal === "SELL").length,
      hold: allSignals.filter(s => s.signal === "HOLD").length,
    };
  }, [allSignals]);

  // Chart data for signal distribution
  const signalPieData = [
    { name: "BUY", value: signalDistribution.buy, color: "hsl(142, 76%, 36%)" },
    { name: "SELL", value: signalDistribution.sell, color: "hsl(0, 84%, 60%)" },
    { name: "HOLD", value: signalDistribution.hold, color: "hsl(38, 92%, 50%)" },
  ].filter(item => item.value > 0);

  const signalBarData = [
    { signal: "BUY", count: signalDistribution.buy },
    { signal: "SELL", count: signalDistribution.sell },
    { signal: "HOLD", count: signalDistribution.hold },
  ];

  // Top sectors by company count
  const topSectorsData = useMemo(() => {
    return sectorOverview
      .sort((a, b) => b.companies - a.companies)
      .slice(0, 10)
      .map(sector => ({
        name: sector.name.length > 15 ? sector.name.substring(0, 15) + "..." : sector.name,
        fullName: sector.name,
        companies: sector.companies,
        buy: sector.buySignals,
        sell: sector.sellSignals,
        hold: sector.holdSignals,
      }));
  }, [sectorOverview]);

  // Sector signal distribution (stacked bar)
  const sectorSignalData = useMemo(() => {
    return sectorOverview
      .sort((a, b) => (b.buySignals + b.sellSignals + b.holdSignals) - (a.buySignals + a.sellSignals + a.holdSignals))
      .slice(0, 8)
      .map(sector => ({
        name: sector.name.length > 12 ? sector.name.substring(0, 12) + "..." : sector.name,
        fullName: sector.name,
        BUY: sector.buySignals,
        SELL: sector.sellSignals,
        HOLD: sector.holdSignals,
      }));
  }, [sectorOverview]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      <div>
        <h1 className="text-3xl font-bold">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Real-time overview of your financial screening data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-companies">{stats.totalCompanies}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all sectors</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Signals</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-active-signals">{stats.activeSignals}</div>
            <p className="text-xs text-muted-foreground mt-1">BUY or SELL signals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sectors</CardTitle>
            <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-sectors">{stats.sectors}</div>
            <p className="text-xs text-muted-foreground mt-1">Industry classifications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Update</CardTitle>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-last-update">{stats.lastUpdate}</div>
            <p className="text-xs text-muted-foreground mt-1">Data refresh time</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 w-full min-w-0">
        {/* Signal Distribution Pie Chart */}
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Signal Distribution</CardTitle>
            <CardDescription>Overall signal breakdown</CardDescription>
          </CardHeader>
          <CardContent className="w-full min-w-0">
            {signalPieData.length > 0 ? (
              <ChartContainer
                config={{
                  BUY: { label: "BUY", color: "hsl(142, 76%, 36%)" },
                  SELL: { label: "SELL", color: "hsl(0, 84%, 60%)" },
                  HOLD: { label: "HOLD", color: "hsl(38, 92%, 50%)" },
                }}
                className="h-[300px] w-full min-w-0"
              >
                <PieChart>
                  <Pie
                    data={signalPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {signalPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No signal data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signal Count Bar Chart */}
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Signal Count</CardTitle>
            <CardDescription>Number of companies by signal type</CardDescription>
          </CardHeader>
          <CardContent className="w-full min-w-0">
            <ChartContainer
              config={{
                count: { label: "Companies", color: "hsl(var(--primary))" },
              }}
              className="h-[300px] w-full min-w-0"
            >
              <BarChart data={signalBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="signal" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top Sectors by Companies */}
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Top Sectors</CardTitle>
            <CardDescription>Largest sectors by company count</CardDescription>
          </CardHeader>
          <CardContent className="w-full min-w-0">
            {topSectorsData.length > 0 ? (
              <ChartContainer
                config={{
                  companies: { label: "Companies", color: "hsl(217, 91%, 60%)" },
                }}
                className="h-[300px] w-full min-w-0"
              >
                <BarChart data={topSectorsData} layout="vertical" margin={{ left: 5, right: 5, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    formatter={(value: any, name: string) => [value, "Companies"]}
                  />
                  <Bar dataKey="companies" fill="hsl(217, 91%, 60%)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No sector data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sector Signal Distribution */}
      <Card className="w-full min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Sector Signal Distribution</CardTitle>
          <CardDescription>Signal breakdown across top sectors</CardDescription>
        </CardHeader>
        <CardContent className="w-full min-w-0 overflow-x-auto">
          {sectorSignalData.length > 0 ? (
            <div className="w-full min-w-[600px]">
              <ChartContainer
                config={{
                  BUY: { label: "BUY", color: "hsl(142, 76%, 36%)" },
                  SELL: { label: "SELL", color: "hsl(0, 84%, 60%)" },
                  HOLD: { label: "HOLD", color: "hsl(38, 92%, 50%)" },
                }}
                className="h-[400px] w-full"
              >
                <BarChart data={sectorSignalData} margin={{ left: 10, right: 10, top: 10, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="BUY" stackId="a" fill="hsl(142, 76%, 36%)" />
                <Bar dataKey="SELL" stackId="a" fill="hsl(0, 84%, 60%)" />
                <Bar dataKey="HOLD" stackId="a" fill="hsl(38, 92%, 50%)" />
              </BarChart>
            </ChartContainer>
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No sector signal data available
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sectors Overview</CardTitle>
            <CardDescription>Signal distribution by industry sector</CardDescription>
          </CardHeader>
          <CardContent>
            {sectorOverview.length > 0 ? (
              <div className="space-y-3">
                {sectorOverview.map((sector) => (
                  <Link key={sector.id} href={`/sectors/${sector.id}`}>
                    <div className="group p-4 rounded-lg border hover-elevate cursor-pointer" data-testid={`card-sector-${sector.id}`}>
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
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No sectors available. Add sectors to get started.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest generated trading signals</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSignals.length > 0 ? (
              <div className="space-y-3">
                {recentSignals.map((item, index) => (
                  <Link key={index} href={`/company/${item.ticker}`}>
                    <div className="group p-4 rounded-lg border hover-elevate cursor-pointer" data-testid={`signal-${item.ticker.toLowerCase()}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-mono font-bold text-lg">{item.ticker}</div>
                          <div className="text-sm text-muted-foreground">{item.company}</div>
                        </div>
                        <SignalBadge signal={item.signal} />
                      </div>
                      {item.metadata && typeof item.metadata === 'object' && 'condition' in (item.metadata as any) && (
                        <div className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded truncate">
                          {String((item.metadata as any).condition)}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No signals yet. Run signal calculation to get started.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
