import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import SignalBadge from "@/components/SignalBadge";
import { useState } from "react";
import { Search } from "lucide-react";
import { Link } from "wouter";

//todo: remove mock functionality
const MOCK_COMPANIES = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", signal: "BUY" as const, roe: 48.2, pe: 28.5, revenue: 123.95 },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Technology", signal: "BUY" as const, roe: 42.3, pe: 32.1, revenue: 211.92 },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Technology", signal: "HOLD" as const, roe: 28.4, pe: 24.7, revenue: 307.39 },
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "Technology", signal: "HOLD" as const, roe: 21.9, pe: 58.3, revenue: 574.78 },
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Technology", signal: "BUY" as const, roe: 73.5, pe: 45.2, revenue: 60.92 },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Technology", signal: "SELL" as const, roe: 19.2, pe: 68.4, revenue: 96.77 },
];

export default function SectorsList() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCompanies = MOCK_COMPANIES.filter(company => {
    const matchesSearch = company.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          Technology Sector
        </h1>
        <p className="text-muted-foreground mt-1">Companies in the technology sector with their signals</p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies or tickers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-11 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <SignalBadge signal="BUY" showIcon={false} />
            <span className="text-sm font-medium text-muted-foreground">3</span>
          </div>
          <div className="flex items-center gap-2">
            <SignalBadge signal="SELL" showIcon={false} />
            <span className="text-sm font-medium text-muted-foreground">1</span>
          </div>
          <div className="flex items-center gap-2">
            <SignalBadge signal="HOLD" showIcon={false} />
            <span className="text-sm font-medium text-muted-foreground">2</span>
          </div>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>{filteredCompanies.length} companies in this sector</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-800">
                  <TableHead className="font-semibold">Ticker</TableHead>
                  <TableHead className="font-semibold">Company Name</TableHead>
                  <TableHead className="text-right font-mono font-semibold">Revenue (B)</TableHead>
                  <TableHead className="text-right font-mono font-semibold">ROE %</TableHead>
                  <TableHead className="text-right font-mono font-semibold">P/E</TableHead>
                  <TableHead className="font-semibold">Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow 
                    key={company.ticker} 
                    className="cursor-pointer border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group" 
                    data-testid={`row-company-${company.ticker.toLowerCase()}`}
                  >
                    <TableCell>
                      <Link href={`/company/${company.ticker}`}>
                        <span className="font-mono font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{company.ticker}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell className="text-right font-mono">${company.revenue}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{company.roe}%</TableCell>
                    <TableCell className="text-right font-mono">{company.pe}</TableCell>
                    <TableCell>
                      <SignalBadge signal={company.signal} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
