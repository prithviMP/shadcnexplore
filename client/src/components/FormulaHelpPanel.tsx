import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, Search, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ALL_FUNCTIONS, FunctionCategory } from "@/components/formulaFunctions";

// Use shared function definitions
const FUNCTIONS = ALL_FUNCTIONS;

const CATEGORIES = ["All", "Logical", "Math", "Text", "Error Handling", "Conditional Aggregation", "Array / Excel 365"] as const;

type FunctionInfo = typeof ALL_FUNCTIONS[0];

interface FormulaHelpPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FormulaHelpPanel({ open, onOpenChange }: FormulaHelpPanelProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<typeof CATEGORIES[number]>("All");

  const filteredFunctions = FUNCTIONS.filter((func) => {
    const matchesSearch =
      func.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      func.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      func.example.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || func.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Example copied to clipboard",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Excel Formula Help
          </SheetTitle>
          <SheetDescription>
            Reference guide for all available Excel-style functions in the Formula Builder
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0 mt-4">
          {/* Search and Filter */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search functions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Functions List */}
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-4">
              {filteredFunctions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No functions found matching your search.</p>
                </div>
              ) : (
                filteredFunctions.map((func) => (
                  <div
                    key={func.name}
                    className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg font-mono">{func.name}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {func.category}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {func.args} args
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{func.description}</p>
                        <div className="bg-muted rounded p-2 font-mono text-sm mb-2">
                          {func.syntax}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">Example:</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-muted rounded p-2 text-xs font-mono break-all">
                              {func.example}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => copyToClipboard(func.example)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer with Quick Tips */}
          <div className="border-t pt-4 mt-4">
            <div className="text-sm space-y-1">
              <p className="font-semibold mb-2">Quick Tips:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Use <code className="bg-muted px-1 rounded">MetricName[Q12]</code> for newest quarter, <code className="bg-muted px-1 rounded">[Q11]</code> for previous, … <code className="bg-muted px-1 rounded">[Q1]</code> = oldest (12-quarter window)</li>
                <li>Array literal: <code className="bg-muted px-1 rounded">{`{ expr1, expr2, ... }`}</code> — use with CHOOSE, MAP, INDEX</li>
                <li>Use <code className="bg-muted px-1 rounded">LET()</code> for readable formulas with intermediate variables</li>
                <li>Use parentheses to clarify operator precedence</li>
                <li>Use <code className="bg-muted px-1 rounded">IFERROR()</code> to handle division by zero</li>
                <li>For SUMIF/COUNTIF, use criteria like <code className="bg-muted px-1 rounded">"&gt;10"</code>, <code className="bg-muted px-1 rounded">"&lt;5"</code>, <code className="bg-muted px-1 rounded">"=value"</code></li>
              </ul>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
