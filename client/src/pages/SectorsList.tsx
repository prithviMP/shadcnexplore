import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import SignalBadge from "@/components/SignalBadge";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Company, Sector } from "@shared/schema";

export default function SectorsList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [, params] = useRoute("/sectors/:sectorName");
  const sectorName = params?.sectorName || "Technology";

  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"]
  });

  const currentSector = sectors?.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
  const sectorCompanies = companies?.filter(c => c.sectorId === currentSector?.id) || [];

  const filteredCompanies = sectorCompanies.filter(company => {
    const matchesSearch = company.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getFinancialValue = (company: Company, key: string): string => {
    if (!company.financialData) return "—";
    const data = company.financialData as any;
    return data[key] !== undefined ? String(data[key]) : "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          {currentSector?.name || sectorName} Sector
        </h1>
        <p className="text-muted-foreground mt-1">{currentSector?.description || `Companies in the ${sectorName} sector with their signals`}</p>
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
      </div>

      <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>{filteredCompanies.length} companies in this sector</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading companies...</div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? `No companies found matching "${searchTerm}"` : "No companies in this sector"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="font-semibold">Ticker</TableHead>
                    <TableHead className="font-semibold">Company Name</TableHead>
                    <TableHead className="text-right font-mono font-semibold">Revenue</TableHead>
                    <TableHead className="text-right font-mono font-semibold">ROE %</TableHead>
                    <TableHead className="text-right font-mono font-semibold">P/E</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow 
                      key={company.id} 
                      className="cursor-pointer border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group" 
                      data-testid={`row-company-${company.ticker.toLowerCase()}`}
                    >
                      <TableCell>
                        <Link href={`/company/${company.ticker}`}>
                          <span className="font-mono font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{company.ticker}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "revenue")}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{getFinancialValue(company, "roe")}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "pe")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
