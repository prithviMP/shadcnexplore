import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SignalBadge from "@/components/SignalBadge";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

//todo: remove mock functionality
const MOCK_COMPANY = {
  ticker: "AAPL",
  name: "Apple Inc.",
  sector: "Technology",
  signal: "BUY" as const
};

const MOCK_QUARTERLY_DATA = [
  { quarter: "Q4 2024", revenue: 123.95, netIncome: 34.63, eps: 2.18, pe: 28.5, roe: 48.2, debt: 0.65 },
  { quarter: "Q3 2024", revenue: 117.15, netIncome: 29.99, eps: 1.89, pe: 29.1, roe: 46.8, debt: 0.67 },
  { quarter: "Q2 2024", revenue: 111.44, netIncome: 26.04, eps: 1.64, pe: 30.2, roe: 44.5, debt: 0.70 },
  { quarter: "Q1 2024", revenue: 119.58, netIncome: 33.92, eps: 2.14, pe: 27.8, roe: 47.1, debt: 0.68 },
];

const MOCK_FORMULAS = [
  { name: "High ROE", scope: "Global", formula: "ROE > 20%", result: "PASS", signal: "BUY" as const },
  { name: "Low PEG", scope: "Global", formula: "PEG < 1.5", result: "PASS", signal: "BUY" as const },
  { name: "Tech Growth", scope: "Sector: Technology", formula: "Revenue Growth > 10%", result: "PASS", signal: "BUY" as const },
];

export default function CompanyDetail() {
  const [selectedQuarter, setSelectedQuarter] = useState("Q4 2024");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sectors">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold font-mono">{MOCK_COMPANY.ticker}</h1>
            <SignalBadge signal={MOCK_COMPANY.signal} />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">{MOCK_COMPANY.name}</p>
            <Badge variant="outline" className="text-xs">{MOCK_COMPANY.sector}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quarterly Financial Data</CardTitle>
            <CardDescription>Latest 4 quarters performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quarter</TableHead>
                    <TableHead className="text-right font-mono">Revenue (B)</TableHead>
                    <TableHead className="text-right font-mono">Net Income (B)</TableHead>
                    <TableHead className="text-right font-mono">EPS</TableHead>
                    <TableHead className="text-right font-mono">P/E</TableHead>
                    <TableHead className="text-right font-mono">ROE %</TableHead>
                    <TableHead className="text-right font-mono">Debt Ratio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_QUARTERLY_DATA.map((row) => (
                    <TableRow 
                      key={row.quarter} 
                      className={`cursor-pointer ${selectedQuarter === row.quarter ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedQuarter(row.quarter)}
                      data-testid={`row-quarter-${row.quarter.replace(' ', '-').toLowerCase()}`}
                    >
                      <TableCell className="font-medium">{row.quarter}</TableCell>
                      <TableCell className="text-right font-mono">${row.revenue}</TableCell>
                      <TableCell className="text-right font-mono">${row.netIncome}</TableCell>
                      <TableCell className="text-right font-mono">${row.eps}</TableCell>
                      <TableCell className="text-right font-mono">{row.pe}</TableCell>
                      <TableCell className="text-right font-mono">{row.roe}%</TableCell>
                      <TableCell className="text-right font-mono">{row.debt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Applied Signals</CardTitle>
            <CardDescription>Formulas evaluated for this company</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOCK_FORMULAS.map((formula) => (
                <div key={formula.name} className="p-4 rounded-md border" data-testid={`formula-${formula.name.toLowerCase().replace(' ', '-')}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-sm">{formula.name}</h4>
                      <p className="text-xs text-muted-foreground">{formula.scope}</p>
                    </div>
                    <SignalBadge signal={formula.signal} />
                  </div>
                  <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                    {formula.formula}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={formula.result === "PASS" ? "default" : "destructive"} className="text-xs">
                      {formula.result}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
