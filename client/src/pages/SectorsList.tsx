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
  const [filterSignal, setFilterSignal] = useState<"ALL" | "BUY" | "SELL" | "HOLD">("ALL");

  const filteredCompanies = MOCK_COMPANIES.filter(company => {
    const matchesSearch = company.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSignal = filterSignal === "ALL" || company.signal === filterSignal;
    return matchesSearch && matchesSignal;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Technology Sector</h1>
        <p className="text-sm text-muted-foreground mt-1">Companies in the technology sector with their signals</p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies or tickers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-2">
          <SignalBadge signal="BUY" showIcon={false} />
          <span className="text-sm text-muted-foreground">5</span>
          <SignalBadge signal="SELL" showIcon={false} />
          <span className="text-sm text-muted-foreground">1</span>
          <SignalBadge signal="HOLD" showIcon={false} />
          <span className="text-sm text-muted-foreground">2</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>{filteredCompanies.length} companies</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead className="text-right font-mono">Revenue (B)</TableHead>
                <TableHead className="text-right font-mono">ROE %</TableHead>
                <TableHead className="text-right font-mono">P/E</TableHead>
                <TableHead>Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company) => (
                <TableRow key={company.ticker} className="cursor-pointer hover:bg-muted/50" data-testid={`row-company-${company.ticker.toLowerCase()}`}>
                  <TableCell>
                    <Link href={`/company/${company.ticker}`}>
                      <span className="font-mono font-medium">{company.ticker}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{company.name}</TableCell>
                  <TableCell className="text-right font-mono">${company.revenue}</TableCell>
                  <TableCell className="text-right font-mono">{company.roe}%</TableCell>
                  <TableCell className="text-right font-mono">{company.pe}</TableCell>
                  <TableCell>
                    <SignalBadge signal={company.signal} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
