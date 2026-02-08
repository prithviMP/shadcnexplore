import React, { RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ALL_FUNCTIONS, FunctionCategory } from "@/components/formulaFunctions";

interface FormulaEditorProps {
    value: string;
    onChange: (value: string) => void;
    textareaRef: RefObject<HTMLTextAreaElement>;
    placeholder?: string;
    className?: string;
    height?: string;
}

export function FormulaEditor({
    value,
    onChange,
    textareaRef,
    placeholder,
    className,
    height = "min-h-[150px]"
}: FormulaEditorProps) {

    const insertToken = (token: string, offsetCursor: number = 0) => {
        if (textareaRef.current) {
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const scrollTop = textarea.scrollTop;

            const newText = text.substring(0, start) + token + text.substring(end);

            // Call parent onChange
            onChange(newText);

            // Restore focus and cursor position
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    const newCursorPos = start + token.length + offsetCursor;
                    textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                    textareaRef.current.scrollTop = scrollTop;
                }
            }, 0);
        }
    };

    // Operators (not functions)
    const operators = [
        { label: "(", value: "()", offset: -1 },
        { label: ")", value: ")" },
        { label: "+", value: "+" },
        { label: "-", value: "-" },
        { label: "*", value: "*" },
        { label: "/", value: "/" },
        { label: ">", value: ">" },
        { label: "<", value: "<" },
        { label: ">=", value: ">=" },
        { label: "<=", value: "<=" },
        { label: "=", value: "=" },
        { label: "<>", value: "<>" },
    ];

    // Helper function to format function button label
    const getFunctionLabel = (func: typeof ALL_FUNCTIONS[0]): string => {
        // For functions with variable arguments, show "..."
        if (func.args.includes("+") || func.args.includes("-")) {
            return `${func.name}(...)`;
        }
        // For functions with fixed arguments, show "()"
        return `${func.name}()`;
    };

    // Group functions by category
    const functionsByCategory = ALL_FUNCTIONS.reduce((acc, func) => {
        if (!acc[func.category]) {
            acc[func.category] = [];
        }
        acc[func.category].push(func);
        return acc;
    }, {} as Record<FunctionCategory, typeof ALL_FUNCTIONS>);

    const categories: FunctionCategory[] = ["Logical", "Math", "Text", "Error Handling", "Conditional Aggregation", "Array / Excel 365"];

    return (
        <div className={cn("flex flex-col gap-2 rounded-md border p-1 bg-background", className)}>
            <Tabs defaultValue="All" className="w-full">
                <TabsList className="w-full justify-start h-auto p-1 bg-muted/30 rounded-t-md border-b">
                    <TabsTrigger value="All" className="text-xs px-2 py-1">
                        All
                    </TabsTrigger>
                    {categories.map((category) => (
                        <TabsTrigger key={category} value={category} className="text-xs px-2 py-1">
                            {category}
                        </TabsTrigger>
                    ))}
                    <TabsTrigger value="Operators" className="text-xs px-2 py-1">
                        Operators
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="All" className="mt-0 p-1">
                    <div className="flex flex-wrap gap-1">
                        {ALL_FUNCTIONS.map((func) => (
                            <Button
                                key={func.name}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 font-mono text-xs"
                                onClick={() => insertToken(`${func.name}()`, -1)}
                                type="button"
                                title={func.syntax}
                            >
                                {getFunctionLabel(func)}
                            </Button>
                        ))}
                    </div>
                </TabsContent>
                {categories.map((category) => (
                    <TabsContent key={category} value={category} className="mt-0 p-1">
                        <div className="flex flex-wrap gap-1">
                            {functionsByCategory[category]?.map((func) => (
                                <Button
                                    key={func.name}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 font-mono text-xs"
                                    onClick={() => insertToken(`${func.name}()`, -1)}
                                    type="button"
                                    title={func.syntax}
                                >
                                    {getFunctionLabel(func)}
                                </Button>
                            ))}
                        </div>
                    </TabsContent>
                ))}
                <TabsContent value="Operators" className="mt-0 p-1">
                    <div className="flex flex-wrap gap-1">
                        {operators.map((op) => (
                            <Button
                                key={op.label}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 font-mono text-xs"
                                onClick={() => insertToken(op.value, op.offset || 0)}
                                type="button"
                            >
                                {op.label}
                            </Button>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    "font-mono text-sm border-0 focus-visible:ring-0 resize-y p-3",
                    height
                )}
                spellCheck={false}
            />
        </div>
    );
}
