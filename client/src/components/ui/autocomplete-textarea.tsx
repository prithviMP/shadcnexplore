import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Available fields from the database
const AVAILABLE_FIELDS = [
  { name: "Ticker", aliases: ["ticker"], description: "Company ticker symbol" },
  { name: "Company", aliases: ["company", "name"], description: "Company name" },
  { name: "Sector", aliases: ["sector"], description: "Company sector" },
  { name: "Revenue", aliases: ["revenue", "sales"], description: "Company revenue" },
  { name: "Net Income", aliases: ["net income", "netincome"], description: "Net income" },
  { name: "ROE", aliases: ["roe"], description: "Return on Equity (%)" },
  { name: "P/E", aliases: ["p/e", "pe", "p/e ratio"], description: "Price to Earnings ratio" },
  { name: "Debt", aliases: ["debt", "debt ratio"], description: "Debt ratio" },
  { name: "Market Cap", aliases: ["market cap", "marketcap"], description: "Market capitalization" },
  { name: "Signal", aliases: ["signal"], description: "Latest trading signal" },
];

// Allowed operators
const OPERATORS = [
  { symbol: "=", description: "Equals" },
  { symbol: ">", description: "Greater than" },
  { symbol: "<", description: "Less than" },
  { symbol: ">=", description: "Greater than or equal" },
  { symbol: "<=", description: "Less than or equal" },
  { symbol: "<>", description: "Not equal" },
];

// Allowed Excel functions
const EXCEL_FUNCTIONS = [
  // Logical Functions
  { name: "AND", description: "Logical AND - AND(condition1, condition2, ...)", args: "2+" },
  { name: "OR", description: "Logical OR - OR(condition1, condition2, ...)", args: "2+" },
  { name: "IF", description: "Conditional - IF(condition, true_value, false_value)", args: "3" },
  { name: "NOT", description: "Logical NOT - NOT(condition)", args: "1" },
  { name: "XOR", description: "Exclusive OR - XOR(condition1, condition2)", args: "2" },
  { name: "ISNUMBER", description: "Check if value is a number - ISNUMBER(value)", args: "1" },
  { name: "ISBLANK", description: "Check if value is blank - ISBLANK(value)", args: "1" },
  // Math Functions
  { name: "SUM", description: "Sum values - SUM(value1, value2, ...)", args: "2+" },
  { name: "AVERAGE", description: "Average values - AVERAGE(value1, value2, ...)", args: "2+" },
  { name: "MAX", description: "Maximum value - MAX(value1, value2, ...)", args: "2+" },
  { name: "MIN", description: "Minimum value - MIN(value1, value2, ...)", args: "2+" },
  { name: "COUNT", description: "Count values - COUNT(value1, value2, ...)", args: "1+" },
  { name: "ROUND", description: "Round number - ROUND(number, digits)", args: "2" },
  { name: "ROUNDUP", description: "Round up - ROUNDUP(number, digits)", args: "2" },
  { name: "ROUNDDOWN", description: "Round down - ROUNDDOWN(number, digits)", args: "2" },
  { name: "ABS", description: "Absolute value - ABS(number)", args: "1" },
  { name: "SQRT", description: "Square root - SQRT(number)", args: "1" },
  { name: "POWER", description: "Power/exponentiation - POWER(base, exponent)", args: "2" },
  { name: "LOG", description: "Logarithm - LOG(number, base?)", args: "1-2" },
  { name: "CEILING", description: "Round up to nearest multiple - CEILING(number, significance?)", args: "1-2" },
  { name: "FLOOR", description: "Round down to nearest multiple - FLOOR(number, significance?)", args: "1-2" },
  // Text Functions
  { name: "TRIM", description: "Remove leading/trailing spaces - TRIM(text)", args: "1" },
  { name: "CONCAT", description: "Concatenate strings - CONCAT(text1, text2, ...)", args: "2+" },
  { name: "CONCATENATE", description: "Concatenate strings - CONCATENATE(text1, text2, ...)", args: "2+" },
  // Error Handling Functions
  { name: "IFERROR", description: "Return error_value if value is error - IFERROR(value, error_value)", args: "2" },
  { name: "NOTNULL", description: "Return value if not null - NOTNULL(value, alternative?)", args: "1-2" },
  { name: "COALESCE", description: "Return first non-null value - COALESCE(value1, value2, ...)", args: "2+" },
  // Conditional Aggregation Functions
  { name: "SUMIF", description: "Sum values matching criteria - SUMIF(range, criteria, sum_range?)", args: "2-3" },
  { name: "COUNTIF", description: "Count values matching criteria - COUNTIF(range, criteria)", args: "2" },
];

interface AutocompleteTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onValueChange?: (value: string) => void;
}

export const AutocompleteTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutocompleteTextareaProps
>(({ className, value, onChange, onValueChange, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = React.useState(0);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Array<{
    type: "field" | "operator" | "function";
    label: string;
    value: string;
    description?: string;
  }>>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const suggestionRef = React.useRef<HTMLDivElement>(null);

  // Combine refs
  React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

  // Get current word at cursor position
  const getCurrentWord = (text: string, position: number): { word: string; start: number; end: number } => {
    // Find word boundaries
    let start = position;
    let end = position;

    // Move start backwards until we hit a non-word character or whitespace
    while (start > 0 && /[\w/]/.test(text[start - 1])) {
      start--;
    }

    // Move end forwards until we hit a non-word character or whitespace
    while (end < text.length && /[\w/]/.test(text[end])) {
      end++;
    }

    const word = text.substring(start, end);
    return { word, start, end };
  };

  // Get context before cursor
  const getContext = (text: string, position: number): {
    beforeWord: string;
    currentWord: string;
    isInFunction: boolean;
    isAfterOperator: boolean;
    isAfterField: boolean;
    isAfterComma: boolean;
  } => {
    const { word, start } = getCurrentWord(text, position);
    const beforeWord = text.substring(0, start).trim();
    
    // Check if we're inside a function call
    const lastOpenParen = beforeWord.lastIndexOf("(");
    const lastCloseParen = beforeWord.lastIndexOf(")");
    const isInFunction = lastOpenParen > lastCloseParen;

    // Check if we're after an operator
    const operators = OPERATORS.map(op => op.symbol);
    const isAfterOperator = operators.some(op => {
      const trimmed = beforeWord.trim();
      return trimmed.endsWith(op) || trimmed.endsWith(op + " ");
    });

    // Check if we're after a field (look for field-like patterns before operators)
    // Pattern: field operator or field space operator
    const fieldPattern = /(\w+)\s*([=<>]+)/;
    const match = beforeWord.match(fieldPattern);
    const isAfterField = !!match && !isAfterOperator;

    // Check if we're after a comma (in function arguments)
    const isAfterComma = beforeWord.endsWith(",") || beforeWord.match(/,\s*$/);

    return {
      beforeWord,
      currentWord: word,
      isInFunction,
      isAfterOperator,
      isAfterField,
      isAfterComma,
    };
  };

  // Generate suggestions based on context
  const generateSuggestions = (text: string, position: number) => {
    const context = getContext(text, position);
    const { currentWord, isInFunction, isAfterOperator, isAfterField, isAfterComma } = context;
    const lowerWord = currentWord.toLowerCase();

    const results: Array<{
      type: "field" | "operator" | "function";
      label: string;
      value: string;
      description?: string;
    }> = [];

    // If we're at the start of query or after comma, suggest fields and functions
    if ((!isAfterField && !isInFunction && !isAfterOperator) || isAfterComma) {
      // Suggest fields
      AVAILABLE_FIELDS.forEach(field => {
        field.aliases.forEach(alias => {
          if (alias.toLowerCase().startsWith(lowerWord) || lowerWord === "") {
            results.push({
              type: "field",
              label: field.name,
              value: alias,
              description: field.description,
            });
          }
        });
      });

      // Suggest functions (only if not after comma or in function)
      if (!isAfterComma && !isInFunction) {
        EXCEL_FUNCTIONS.forEach(func => {
          if (func.name.toLowerCase().startsWith(lowerWord) || lowerWord === "") {
            results.push({
              type: "function",
              label: func.name,
              value: func.name,
              description: func.description,
            });
          }
        });
      }
    }

    // If we're after a field, suggest operators
    if (isAfterField && !isAfterOperator) {
      OPERATORS.forEach(op => {
        if (op.symbol.startsWith(currentWord) || currentWord === "") {
          results.push({
            type: "operator",
            label: op.symbol,
            value: op.symbol,
            description: op.description,
          });
        }
      });
    }

    // If we're after an operator, suggest fields (for field comparisons) or just show fields
    if (isAfterOperator) {
      AVAILABLE_FIELDS.forEach(field => {
        field.aliases.forEach(alias => {
          if (alias.toLowerCase().startsWith(lowerWord) || lowerWord === "") {
            results.push({
              type: "field",
              label: field.name,
              value: alias,
              description: field.description,
            });
          }
        });
      });
    }

    // If we're in a function (after opening paren or comma), suggest fields
    if (isInFunction && (isAfterComma || currentWord === "")) {
      AVAILABLE_FIELDS.forEach(field => {
        field.aliases.forEach(alias => {
          if (alias.toLowerCase().startsWith(lowerWord) || lowerWord === "") {
            results.push({
              type: "field",
              label: field.name,
              value: alias,
              description: field.description,
            });
          }
        });
      });
    }

    // Remove duplicates
    const unique = Array.from(
      new Map(results.map(item => [item.value, item])).values()
    );

    setSuggestions(unique);
    setShowSuggestions(unique.length > 0);
    setSelectedIndex(0);
  };

  // Calculate suggestion popover position
  const updateSuggestionPosition = () => {
    if (!textareaRef.current || !suggestionRef.current) return;

    const textarea = textareaRef.current;
    const text = textarea.value;
    const position = textarea.selectionStart;

    // Create a temporary span to measure text position
    const span = document.createElement("span");
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    span.style.whiteSpace = "pre-wrap";
    span.style.font = window.getComputedStyle(textarea).font;
    span.style.padding = window.getComputedStyle(textarea).padding;
    span.style.width = window.getComputedStyle(textarea).width;
    span.textContent = text.substring(0, position);
    
    const textareaRect = textarea.getBoundingClientRect();
    document.body.appendChild(span);
    const spanRect = span.getBoundingClientRect();
    
    const suggestionEl = suggestionRef.current;
    const top = textareaRect.top + spanRect.height + window.scrollY + 5;
    const left = textareaRect.left + window.scrollX;
    
    suggestionEl.style.position = "absolute";
    suggestionEl.style.top = `${top}px`;
    suggestionEl.style.left = `${left}px`;
    suggestionEl.style.zIndex = "1000";
    
    document.body.removeChild(span);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newPosition = e.target.selectionStart;

    setCursorPosition(newPosition);
    
    if (onChange) {
      onChange(e);
    }
    
    if (onValueChange) {
      onValueChange(newValue);
    }

    // Generate suggestions only if there's text or we're typing
    if (newValue.length > 0 || newPosition > 0) {
      // Use requestAnimationFrame for better performance
      requestAnimationFrame(() => {
        generateSuggestions(newValue, newPosition);
      });
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    }
  };

  const insertSuggestion = (suggestion: typeof suggestions[0]) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const text = textarea.value;
    const position = textarea.selectionStart;
    const { word, start, end } = getCurrentWord(text, position);

    const before = text.substring(0, start);
    const after = text.substring(end);
    const newText = before + suggestion.value + after;
    const newPosition = start + suggestion.value.length;

    // Update value
    if (onValueChange) {
      onValueChange(newText);
    }

    // Update textarea
    textarea.value = newText;
    textarea.setSelectionRange(newPosition, newPosition);

    // Trigger change event
    const event = new Event("input", { bubbles: true });
    textarea.dispatchEvent(event);

    setShowSuggestions(false);
    textarea.focus();
  };

  const handleSuggestionClick = (suggestion: typeof suggestions[0]) => {
    insertSuggestion(suggestion);
  };

  // Close suggestions when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionRef.current &&
        !suggestionRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showSuggestions]);

  // Update suggestion position when needed
  React.useEffect(() => {
    if (showSuggestions && suggestionRef.current) {
      const timer = setTimeout(() => {
        updateSuggestionPosition();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [showSuggestions, suggestions, cursorPosition]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={(e) => {
          const target = e.target as HTMLTextAreaElement;
          setCursorPosition(target.selectionStart);
        }}
        className={className}
        {...props}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionRef}
          className="w-[400px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-1"
        >
          <Command>
            <CommandList>
              <CommandEmpty>No suggestions found.</CommandEmpty>
              {suggestions.map((suggestion, index) => (
                <CommandItem
                  key={`${suggestion.type}-${suggestion.value}-${index}`}
                  value={suggestion.value}
                  onSelect={() => handleSuggestionClick(suggestion)}
                  className={cn(
                    "cursor-pointer",
                    index === selectedIndex && "bg-accent"
                  )}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{suggestion.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {suggestion.type}
                      </span>
                    </div>
                    {suggestion.description && (
                      <span className="text-xs text-muted-foreground">
                        {suggestion.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
});

AutocompleteTextarea.displayName = "AutocompleteTextarea";

