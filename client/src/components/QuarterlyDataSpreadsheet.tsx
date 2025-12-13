import React, { useMemo, useCallback } from "react";
import { ReactGrid, Column, Row, CellChange, TextCell, NumberCell, CellStyle } from "@silevis/reactgrid";
import "@silevis/reactgrid/styles.css";
import { formatQuarterWithLabel } from "@/utils/quarterUtils";
import { Link } from "wouter";
import SignalBadge from "@/components/SignalBadge";
import { useTheme } from "next-themes";

interface QuarterlyDataSpreadsheetProps {
    data: {
        sectorId: string;
        quarters: string[];
        metrics: string[];
        companies: Array<{
            ticker: string;
            companyId: string | null;
            companyName: string;
            quarters: Record<string, Record<string, string | null>>;
        }>;
    } | undefined;
    selectedMetrics: string[];
    selectedQuarters: string[];
    onCellSelect: (metric: string, quarter: string) => void;
    selectedCells: Set<string>; // Format: "metric:quarter"
    formulaResults: Record<string, { result: string | number | boolean; type: string }>;
    mode?: "company" | "sector"; // New prop to support single company view
}

export default function QuarterlyDataSpreadsheet({
    data,
    selectedMetrics,
    selectedQuarters,
    onCellSelect,
    selectedCells,
    formulaResults,
    mode = "sector",
}: QuarterlyDataSpreadsheetProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    // Theme-based colors
    const colors = useMemo(() => ({
        text: isDark ? "#e2e8f0" : "#0f172a", // slate-200 : slate-900
        textMuted: isDark ? "#94a3b8" : "#64748b", // slate-400 : slate-500
        bg: isDark ? "#020617" : "#ffffff", // slate-950 : white
        bgHeader: isDark ? "#1e293b" : "#f1f5f9", // slate-800 : slate-100
        bgRowHeader: isDark ? "#0f172a" : "#f8fafc", // slate-900 : slate-50
        border: isDark ? "#334155" : "#e2e8f0", // slate-700 : slate-200
        selectionBorder: "#3b82f6", // blue-500
        selectionBg: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)",
        resultText: isDark ? "#38bdf8" : "#0369a1", // sky-400 : sky-700
        resultBg: isDark ? "rgba(56, 189, 248, 0.1)" : "#f0f9ff",
    }), [isDark]);

    // State for column widths
    const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});

    // Define columns
    const getColumns = useCallback((): Column[] => {
        if (!data) return [];

        const quartersToShow = selectedQuarters.length > 0 ? selectedQuarters : data.quarters.slice(-12);

        const columns: Column[] = [
            {
                columnId: "company_metric",
                width: columnWidths["company_metric"] || 250,
                resizable: true
            },
            ...quartersToShow.map(q => ({
                columnId: q,
                width: columnWidths[q] || 100,
                resizable: true
            })),
            {
                columnId: "result",
                width: columnWidths["result"] || 120,
                resizable: true
            }
        ];

        return columns;
    }, [data, selectedQuarters, columnWidths]);

    // Define rows
    const getRows = useCallback((): Row[] => {
        if (!data) return [];

        const quartersToShow = selectedQuarters.length > 0 ? selectedQuarters : data.quarters.slice(-12);
        const metricsToShow = selectedMetrics.length > 0 ? selectedMetrics : data.metrics.slice(0, 6);

        // Common cell style for normal cells
        const baseCellStyle: CellStyle = {
            color: colors.text,
            background: colors.bg,
            border: {
                bottom: { style: "solid", width: "1px", color: colors.border },
                right: { style: "solid", width: "1px", color: colors.border }
            }
        };

        const headerCellStyle: CellStyle = {
            color: colors.text,
            background: colors.bgHeader,
            border: {
                bottom: { style: "solid", width: "1px", color: colors.border },
                right: { style: "solid", width: "1px", color: colors.border }
            }
        };

        // Single company mode: metrics as rows, no company grouping
        if (mode === "company" && data.companies.length === 1) {
            const company = data.companies[0];
            // Try to get result from company ticker first, then "result" key
            const companyResult = formulaResults[company.ticker] || formulaResults["result"] || null;

            // Header Row
            const headerRow: Row = {
                rowId: "header",
                cells: [
                    { type: "header" as const, text: "Metric", style: headerCellStyle, className: "font-semibold" },
                    ...quartersToShow.map((q, index) => {
                        const label = `Q${index + 1}`;
                        return {
                            type: "header" as const,
                            text: `${label} - ${q}`,
                            style: headerCellStyle,
                            className: "font-semibold"
                        };
                    }),
                    { type: "header" as const, text: "Result", style: headerCellStyle, className: "font-semibold" }
                ]
            };

            // Metric Rows
            const metricRows: Row[] = metricsToShow.map((metric) => {
                return {
                    rowId: `metric-${metric}`,
                    cells: [
                        {
                            type: "text" as const,
                            text: metric,
                            nonEditable: true,
                            style: { ...baseCellStyle, color: colors.textMuted },
                            className: "font-medium"
                        },
                        ...quartersToShow.map((quarter) => {
                            const value = company.quarters[quarter]?.[metric];
                            const numValue = value ? parseFloat(value) : null;
                            const isSelected = selectedCells.has(`${metric}:${quarter}`);

                            const cellStyle: CellStyle = isSelected ? {
                                ...baseCellStyle,
                                border: {
                                    left: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                    right: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                    top: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                    bottom: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                },
                                background: colors.selectionBg
                            } : baseCellStyle;

                            // Format value - always show 2 decimal places for numbers
                            let displayValue = value || "—";
                            if (numValue !== null && !isNaN(numValue)) {
                                if (metric.includes("%") || metric.includes("Growth") || metric.includes("YoY") || metric.includes("QoQ")) {
                                    displayValue = `${numValue.toFixed(2)}%`;
                                } else {
                                    // Always show 2 decimal places for all numbers
                                    displayValue = numValue.toFixed(2);
                                }
                            }

                            return {
                                type: "text" as const,
                                text: displayValue,
                                nonEditable: true,
                                style: cellStyle
                            } as TextCell;
                        }),
                        // Show result in all metric rows for single company view
                        {
                            type: "text" as const,
                            text: companyResult ? String(companyResult.result) : "—",
                            nonEditable: true,
                            style: {
                                ...baseCellStyle,
                                background: companyResult ? colors.resultBg : colors.bg,
                                color: companyResult ? colors.resultText : colors.textMuted
                            },
                            className: "font-semibold"
                        }
                    ]
                };
            });

            return [headerRow, ...metricRows];
        }

        // Sector mode: multiple companies
        // 1. Header Row
        const headerRow: Row = {
            rowId: "header",
            cells: [
                { type: "header" as const, text: "Company / Metric", style: headerCellStyle, className: "font-semibold" },
                ...quartersToShow.map((q, index) => {
                    const label = `Q${index + 1}`;
                    return {
                        type: "header" as const,
                        text: `${label} - ${q}`,
                        style: headerCellStyle,
                        className: "font-semibold"
                    };
                }),
                { type: "header" as const, text: "Result", style: headerCellStyle, className: "font-semibold" }
            ]
        };

        // 2. Data Rows (Grouped by Company)
        const dataRows: Row[] = data.companies.flatMap((company) => {
            // Company Header Row
            const companyHeaderRow: Row = {
                rowId: `company-${company.ticker}`,
                cells: [
                    {
                        type: "text" as const,
                        text: `${company.ticker} - ${company.companyName}`,
                        nonEditable: true,
                        style: {
                            ...baseCellStyle,
                            background: colors.bgRowHeader,
                            border: { bottom: { style: "solid", width: "1px", color: colors.border } }
                        },
                        className: "font-semibold"
                    },
                    ...quartersToShow.map(() => ({
                        type: "text" as const,
                        text: "",
                        nonEditable: true,
                        style: { ...baseCellStyle, background: colors.bgRowHeader }
                    })),
                    {
                        type: "text" as const,
                        text: formulaResults[company.ticker] ? String(formulaResults[company.ticker].result) : "—",
                        nonEditable: true,
                        style: { ...baseCellStyle, background: colors.bgRowHeader, color: colors.resultText },
                        className: "font-semibold"
                    }
                ]
            };

            // Metric Rows
            const metricRows: Row[] = metricsToShow.map((metric) => {
                return {
                    rowId: `${company.ticker}-${metric}`,
                    cells: [
                        {
                            type: "text" as const,
                            text: metric,
                            nonEditable: true,
                            style: { ...baseCellStyle, color: colors.textMuted }
                        },
                        ...quartersToShow.map((quarter) => {
                            const value = company.quarters[quarter]?.[metric];
                            const numValue = value ? parseFloat(value) : null;
                            const isSelected = selectedCells.has(`${metric}:${quarter}`);

                            const cellStyle: CellStyle = isSelected ? {
                                ...baseCellStyle,
                                border: {
                                    left: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                    right: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                    top: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                    bottom: { color: colors.selectionBorder, width: "2px", style: "solid" },
                                },
                                background: colors.selectionBg
                            } : baseCellStyle;

                            // Format value - always show 2 decimal places for numbers
                            let displayValue = value || "—";
                            if (numValue !== null && !isNaN(numValue)) {
                                if (metric.includes("%") || metric.includes("Growth") || metric.includes("YoY") || metric.includes("QoQ")) {
                                    displayValue = `${numValue.toFixed(2)}%`;
                                } else {
                                    // Always show 2 decimal places for all numbers
                                    displayValue = numValue.toFixed(2);
                                }
                            }

                            return {
                                type: "text" as const,
                                text: displayValue,
                                nonEditable: true,
                                style: cellStyle
                            } as TextCell;
                        }),
                        { type: "text" as const, text: "", nonEditable: true, style: baseCellStyle }
                    ]
                };
            });

            return [companyHeaderRow, ...metricRows];
        });

        return [headerRow, ...dataRows];
    }, [data, selectedQuarters, selectedMetrics, selectedCells, formulaResults, mode, colors]);

    // Calculate dynamic height
    const rowHeight = 35; // Approximate height per row in pixels
    const headerHeight = 40; // Header row height
    let totalRows = 1;
    if (data) {
        if (mode === "company" && data.companies.length === 1) {
            // Single company: just metrics as rows
            totalRows = 1 + (selectedMetrics.length > 0 ? selectedMetrics.length : (data.metrics.length > 0 ? 6 : 0));
        } else {
            // Sector mode: companies with metrics
            totalRows = 1 + (data.companies.length * (1 + (selectedMetrics.length > 0 ? selectedMetrics.length : (data.metrics.length > 0 ? 6 : 0))));
        }
    }
    const calculatedHeight = Math.min(Math.max(totalRows * rowHeight + headerHeight, 200), 800); // Min 200px, Max 800px

    return (
        <div
            className="w-full overflow-auto border rounded-lg bg-white dark:bg-slate-950 transition-all duration-200"
            style={{ height: `${calculatedHeight}px` }}
        >
            {data ? (
                <ReactGrid
                    rows={getRows()}
                    columns={getColumns()}
                    stickyTopRows={1}
                    stickyLeftColumns={1}
                    enableRangeSelection={true}
                    enableFillHandle={false}
                    onColumnResized={(columnId, width) => {
                        setColumnWidths(prev => ({
                            ...prev,
                            [columnId]: width
                        }));
                    }}
                    onFocusLocationChanged={(location) => {
                        // location: { rowId, columnId }
                        const rowId = String(location.rowId);
                        const colId = String(location.columnId);

                        // Single company mode: row ID format is `metric-${metric}`
                        if (mode === "company" && rowId.startsWith("metric-") && colId !== "company_metric" && colId !== "result") {
                            const metric = rowId.replace("metric-", "");
                            onCellSelect(metric, colId);
                        }
                        // Sector mode: Row ID format: `${company.ticker}-${metric}`
                        else if (mode === "sector" && rowId.includes("-") && !rowId.startsWith("company-") && colId !== "company_metric" && colId !== "result") {
                            const [ticker, ...metricParts] = rowId.split("-");
                            const metric = metricParts.join("-"); // Rejoin in case metric name has hyphens
                            onCellSelect(metric, colId);
                        }
                    }}
                />
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    Loading data...
                </div>
            )}
        </div>
    );
}
