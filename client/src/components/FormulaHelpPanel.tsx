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

interface FunctionInfo {
  name: string;
  category: "Logical" | "Math" | "Text" | "Error Handling" | "Conditional Aggregation";
  syntax: string;
  description: string;
  example: string;
  args: string;
}

const FUNCTIONS: FunctionInfo[] = [
  // Logical Functions
  {
    name: "IF",
    category: "Logical",
    syntax: "IF(condition, true_value, false_value)",
    description: "Returns true_value if condition is true, otherwise false_value",
    example: 'IF(Revenue[Q1] > 1000, "BUY", "HOLD")',
    args: "3",
  },
  {
    name: "AND",
    category: "Logical",
    syntax: "AND(condition1, condition2, ...)",
    description: "Returns true if all conditions are true",
    example: "AND(ROE[Q1] > 0.15, Debt[Q1] < 0.5)",
    args: "2+",
  },
  {
    name: "OR",
    category: "Logical",
    syntax: "OR(condition1, condition2, ...)",
    description: "Returns true if any condition is true",
    example: "OR(Revenue[Q1] > 1000, Revenue[Q2] > 1000)",
    args: "2+",
  },
  {
    name: "NOT",
    category: "Logical",
    syntax: "NOT(condition)",
    description: "Returns the opposite of the condition",
    example: "NOT(Debt[Q1] > 0.5)",
    args: "1",
  },
  {
    name: "ISNUMBER",
    category: "Logical",
    syntax: "ISNUMBER(value)",
    description: "Returns true if the value is a number",
    example: "ISNUMBER(Revenue[Q1])",
    args: "1",
  },
  {
    name: "ISBLANK",
    category: "Logical",
    syntax: "ISBLANK(value)",
    description: "Returns true if the value is null, undefined, or empty",
    example: "ISBLANK(Revenue[Q1])",
    args: "1",
  },
  // Math Functions
  {
    name: "SUM",
    category: "Math",
    syntax: "SUM(value1, value2, ...)",
    description: "Sums all numeric values",
    example: "SUM(Revenue[Q1], Revenue[Q2], Revenue[Q3])",
    args: "2+",
  },
  {
    name: "AVERAGE",
    category: "Math",
    syntax: "AVERAGE(value1, value2, ...)",
    description: "Calculates the average of all numeric values",
    example: "AVERAGE(Revenue[Q1], Revenue[Q2], Revenue[Q3])",
    args: "2+",
  },
  {
    name: "MAX",
    category: "Math",
    syntax: "MAX(value1, value2, ...)",
    description: "Returns the maximum value",
    example: "MAX(Revenue[Q1], Revenue[Q2], Revenue[Q3])",
    args: "2+",
  },
  {
    name: "MIN",
    category: "Math",
    syntax: "MIN(value1, value2, ...)",
    description: "Returns the minimum value",
    example: "MIN(Revenue[Q1], Revenue[Q2], Revenue[Q3])",
    args: "2+",
  },
  {
    name: "COUNT",
    category: "Math",
    syntax: "COUNT(value1, value2, ...)",
    description: "Counts the number of non-null values",
    example: "COUNT(Revenue[Q1], Revenue[Q2], Revenue[Q3])",
    args: "1+",
  },
  {
    name: "ROUND",
    category: "Math",
    syntax: "ROUND(number, digits)",
    description: "Rounds a number to the specified number of decimal places",
    example: "ROUND(Revenue[Q1] / 1000, 2)",
    args: "2",
  },
  {
    name: "ROUNDUP",
    category: "Math",
    syntax: "ROUNDUP(number, digits)",
    description: "Rounds a number up to the specified number of decimal places",
    example: "ROUNDUP(Revenue[Q1] / 1000, 2)",
    args: "2",
  },
  {
    name: "ROUNDDOWN",
    category: "Math",
    syntax: "ROUNDDOWN(number, digits)",
    description: "Rounds a number down to the specified number of decimal places",
    example: "ROUNDDOWN(Revenue[Q1] / 1000, 2)",
    args: "2",
  },
  {
    name: "ABS",
    category: "Math",
    syntax: "ABS(number)",
    description: "Returns the absolute value of a number",
    example: "ABS(Revenue[Q1] - Revenue[Q2])",
    args: "1",
  },
  {
    name: "SQRT",
    category: "Math",
    syntax: "SQRT(number)",
    description: "Returns the square root of a number",
    example: "SQRT(Revenue[Q1])",
    args: "1",
  },
  {
    name: "POWER",
    category: "Math",
    syntax: "POWER(base, exponent)",
    description: "Raises a number to a power",
    example: "POWER(Revenue[Q1], 2)",
    args: "2",
  },
  {
    name: "LOG",
    category: "Math",
    syntax: "LOG(number, base?)",
    description: "Returns the logarithm of a number. Base defaults to 10 if not specified",
    example: "LOG(100) or LOG(8, 2)",
    args: "1-2",
  },
  {
    name: "CEILING",
    category: "Math",
    syntax: "CEILING(number, significance?)",
    description: "Rounds a number up to the nearest multiple of significance. Default significance is 1",
    example: "CEILING(Revenue[Q1], 100)",
    args: "1-2",
  },
  {
    name: "FLOOR",
    category: "Math",
    syntax: "FLOOR(number, significance?)",
    description: "Rounds a number down to the nearest multiple of significance. Default significance is 1",
    example: "FLOOR(Revenue[Q1], 100)",
    args: "1-2",
  },
  // Text Functions
  {
    name: "TRIM",
    category: "Text",
    syntax: "TRIM(text)",
    description: "Removes leading and trailing spaces from text",
    example: 'TRIM("  Revenue  ")',
    args: "1",
  },
  {
    name: "CONCAT",
    category: "Text",
    syntax: "CONCAT(text1, text2, ...)",
    description: "Concatenates multiple text values or numbers into a single string",
    example: 'CONCAT("Revenue: ", Revenue[Q1])',
    args: "2+",
  },
  {
    name: "CONCATENATE",
    category: "Text",
    syntax: "CONCATENATE(text1, text2, ...)",
    description: "Alias for CONCAT - concatenates multiple text values",
    example: 'CONCATENATE("Q1: ", Revenue[Q1], ", Q2: ", Revenue[Q2])',
    args: "2+",
  },
  // Error Handling Functions
  {
    name: "IFERROR",
    category: "Error Handling",
    syntax: "IFERROR(value, error_value)",
    description: "Returns error_value if value is null, undefined, or NaN. Otherwise returns value",
    example: "IFERROR(Revenue[Q1] / Revenue[Q2], 0)",
    args: "2",
  },
  {
    name: "NOTNULL",
    category: "Error Handling",
    syntax: "NOTNULL(value, alternative?)",
    description: "Returns value if it's not null, otherwise returns alternative (or null if not provided)",
    example: "NOTNULL(Revenue[Q1], 0)",
    args: "1-2",
  },
  {
    name: "COALESCE",
    category: "Error Handling",
    syntax: "COALESCE(value1, value2, ...)",
    description: "Returns the first non-null value from the list",
    example: "COALESCE(Revenue[Q1], Revenue[Q2], Revenue[Q3], 0)",
    args: "2+",
  },
  // Conditional Aggregation Functions
  {
    name: "SUMIF",
    category: "Conditional Aggregation",
    syntax: "SUMIF(range, criteria, sum_range?)",
    description: "Sums values in sum_range (or range if not provided) where values in range match the criteria",
    example: 'SUMIF(Revenue[Q1], ">1000", Revenue[Q1])',
    args: "2-3",
  },
  {
    name: "COUNTIF",
    category: "Conditional Aggregation",
    syntax: "COUNTIF(range, criteria)",
    description: "Counts the number of values in range that match the criteria",
    example: 'COUNTIF(Revenue[Q1], ">1000")',
    args: "2",
  },
];

const CATEGORIES = ["All", "Logical", "Math", "Text", "Error Handling", "Conditional Aggregation"] as const;

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
                <li>Use <code className="bg-muted px-1 rounded">MetricName[Q1]</code> to reference quarterly metrics</li>
                <li>Q1 = Most Recent Quarter, Q2 = Previous Quarter, etc.</li>
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

