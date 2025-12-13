import React, { RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

    const helpers = [
        { label: "IF", value: "IF()", offset: -1 },
        { label: "AND", value: "AND()", offset: -1 },
        { label: "OR", value: "OR()", offset: -1 },
        { label: "NOTNULL", value: "NOTNULL()", offset: -1 },
        { label: "IFERROR", value: "IFERROR()", offset: -1 },
        { label: "ROUNDUP", value: "ROUNDUP()", offset: -1 },
        { label: "ROUNDDOWN", value: "ROUNDDOWN()", offset: -1 },
        { label: "SQRT", value: "SQRT()", offset: -1 },
        { label: "POWER", value: "POWER()", offset: -1 },
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

    return (
        <div className={cn("flex flex-col gap-2 rounded-md border p-1 bg-background", className)}>
            <div className="flex flex-wrap gap-1 p-1 bg-muted/30 rounded-t-md border-b">
                {helpers.map((helper) => (
                    <Button
                        key={helper.label}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 font-mono text-xs"
                        onClick={() => insertToken(helper.value, helper.offset)}
                        type="button" // Prevent form submission
                    >
                        {helper.label}
                    </Button>
                ))}
            </div>
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
