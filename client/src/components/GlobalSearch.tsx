import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, Search, TrendingUp } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { Company, Sector } from "@shared/schema";

type SearchResult = {
  type: "company" | "sector";
  id: string;
  company?: Company;
  sector?: Sector;
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch function for async search
  const searchItems = async (query?: string): Promise<SearchResult[]> => {
    if (!query || query.trim().length === 0) {
      return [];
    }

    setIsLoading(true);
    try {
      const term = query.toLowerCase();
      const allResults: SearchResult[] = [];

      // Fetch companies
      const companiesRes = await apiRequest("GET", "/api/companies");
      const companies: Company[] = await companiesRes.json();
      
      const filteredCompanies = companies.filter(
        (company) =>
          company.ticker.toLowerCase().includes(term) ||
          company.name?.toLowerCase().includes(term)
      );

      filteredCompanies.forEach((company) => {
        allResults.push({
          type: "company",
          id: company.id,
          company,
        });
      });

      // Fetch sectors
      const sectorsRes = await apiRequest("GET", "/api/sectors");
      const sectors: Sector[] = await sectorsRes.json();
      
      const filteredSectors = sectors.filter((sector) =>
        sector.name.toLowerCase().includes(term)
      );

      filteredSectors.forEach((sector) => {
        allResults.push({
          type: "sector",
          id: sector.id,
          sector,
        });
      });

      return allResults;
    } catch (error) {
      console.error("Search error:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      const searchResults = await searchItems(search);
      setResults(searchResults);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  // Handle keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (result: SearchResult) => {
    if (result.type === "company" && result.company) {
      setLocation(`/company/id/${result.company.id}`);
    } else if (result.type === "sector" && result.sector) {
      setLocation(`/sectors/${result.sector.id}`);
    }
    setOpen(false);
    setSearch("");
    setResults([]);
  };

  const companies = results.filter((r) => r.type === "company");
  const sectors = results.filter((r) => r.type === "sector");
  const hasResults = companies.length > 0 || sectors.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="relative h-9 w-full sm:w-64 justify-start text-sm text-muted-foreground font-normal"
        >
          <Search className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">Search companies or sectors...</span>
          <kbd className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-1rem)] sm:w-[400px] p-0" align="end" side="bottom" sideOffset={8}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search companies or sectors..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : !hasResults && search.trim() ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : !search.trim() ? (
              <CommandEmpty>Start typing to search...</CommandEmpty>
            ) : (
              <>
                {companies.length > 0 && (
                  <CommandGroup heading="Companies">
                    {companies.map((result) => (
                      <CommandItem
                        key={`company-${result.id}`}
                        value={`company-${result.id}`}
                        onSelect={() => handleSelect(result)}
                        className="cursor-pointer"
                      >
                        <TrendingUp className="mr-2 h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-semibold">{result.company?.ticker}</span>
                          <span className="text-xs text-muted-foreground">
                            {result.company?.name}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {sectors.length > 0 && (
                  <CommandGroup heading="Sectors">
                    {sectors.map((result) => (
                      <CommandItem
                        key={`sector-${result.id}`}
                        value={`sector-${result.id}`}
                        onSelect={() => handleSelect(result)}
                        className="cursor-pointer"
                      >
                        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-semibold">{result.sector?.name}</span>
                          {result.sector?.description && (
                            <span className="text-xs text-muted-foreground">
                              {result.sector.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

