import React, { useMemo, useCallback } from "react";
import { ReactGrid, Column, Row, CellChange, TextCell, NumberCell, CellStyle } from "@silevis/reactgrid";
import "@silevis/reactgrid/styles.css";
import { formatQuarterWithLabel } from "@/utils/quarterUtils";
import { Link } from "wouter";
import SignalBadge from "@/components/SignalBadge";

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

        // Single company mode: metrics as rows, no company grouping
        if (mode === "company" && data.companies.length === 1) {
            const company = data.companies[0];
            // Try to get result from company ticker first, then "result" key
            const companyResult = formulaResults[company.ticker] || formulaResults["result"] || null;

            // Header Row
            const headerRow: Row = {
                rowId: "header",
                cells: [
                    { type: "header" as const, text: "Metric" },
                    ...quartersToShow.map((q, index) => {
                        // Q1 = Oldest in selected window
                        // quartersToShow is sorted Oldest -> Newest
                        // So index 0 -> Q1
                        const label = `Q${index + 1}`;

                        return {
                            type: "header" as const,
                            text: `${label} - ${q}`
                        };
                    }),
                    { type: "header" as const, text: "Result" }
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
                            style: { color: "#64748b", fontWeight: "500" }
                        },
                        ...quartersToShow.map((quarter) => {
                            const value = company.quarters[quarter]?.[metric];
                            const numValue = value ? parseFloat(value) : null;
                            const isSelected = selectedCells.has(`${metric}:${quarter}`);

                            const cellStyle: CellStyle = isSelected ? {
                                border: {
                                    left: { color: "#3b82f6", width: "2px", style: "solid" },
                                    right: { color: "#3b82f6", width: "2px", style: "solid" },
                                    top: { color: "#3b82f6", width: "2px", style: "solid" },
                                    bottom: { color: "#3b82f6", width: "2px", style: "solid" },
                                },
                                background: "rgba(59, 130, 246, 0.1)"
                            } : {};

                            // Format value
                            let displayValue = value || "—";
                            if (numValue !== null && !isNaN(numValue)) {
                                if (metric.includes("%") || metric.includes("Growth") || metric.includes("YoY") || metric.includes("QoQ")) {
                                    displayValue = `${numValue.toFixed(2)}%`;
                                } else if (Math.abs(numValue) >= 1000) {
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
                        // Show result in all metric rows for single company view (or just last row)
                        // For now, show in all rows for better visibility
                        {
                            type: "text" as const,
                            text: companyResult ? String(companyResult.result) : "—",
                            nonEditable: true,
                            style: {
                                background: companyResult ? "#f0f9ff" : "transparent",
                                fontWeight: "600",
                                color: companyResult ? "#0369a1" : "#64748b"
                            }
                        }
                    ]
                };
            });

            return [headerRow, ...metricRows];
        }

        // Sector mode: multiple companies (existing logic)
        // 1. Header Row
        const headerRow: Row = {
            rowId: "header",
            cells: [
                { type: "header" as const, text: "Company / Metric" },
                ...quartersToShow.map((q, index) => {
                    // Q1 = Oldest in selected window
                    // quartersToShow is sorted Oldest -> Newest
                    const label = `Q${index + 1}`;

                    return {
                        type: "header" as const,
                        text: `${label} - ${q}`
                    };
                }),
                { type: "header" as const, text: "Result" }
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
                        style: { background: "#f8fafc", border: { bottom: { style: "solid", width: "1px", color: "#e2e8f0" } } }
                    },
                    ...quartersToShow.map(() => ({ type: "text" as const, text: "", nonEditable: true, style: { background: "#f8fafc" } })),
                    {
                        type: "text" as const,
                        text: formulaResults[company.ticker] ? String(formulaResults[company.ticker].result) : "—",
                        nonEditable: true,
                        style: { background: "#f8fafc" }
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
                            style: { color: "#64748b" }
                        },
                        ...quartersToShow.map((quarter) => {
                            const value = company.quarters[quarter]?.[metric];
                            const numValue = value ? parseFloat(value) : null;
                            const isSelected = selectedCells.has(`${metric}:${quarter}`);

                            const cellStyle: CellStyle = isSelected ? {
                                border: {
                                    left: { color: "#3b82f6", width: "2px", style: "solid" },
                                    right: { color: "#3b82f6", width: "2px", style: "solid" },
                                    top: { color: "#3b82f6", width: "2px", style: "solid" },
                                    bottom: { color: "#3b82f6", width: "2px", style: "solid" },
                                },
                                background: "rgba(59, 130, 246, 0.1)"
                            } : {};

                            // Format value
                            let displayValue = value || "—";
                            if (numValue !== null && !isNaN(numValue)) {
                                if (metric.includes("%") || metric.includes("Growth") || metric.includes("YoY") || metric.includes("QoQ")) {
                                    displayValue = `${numValue.toFixed(2)}%`;
                                } else if (Math.abs(numValue) >= 1000) {
                                    // Simple formatting for large numbers to keep grid clean
                                    displayValue = numValue.toFixed(2);
                                }
                            }

                            return {
                                type: "text" as const, // Using text cell for formatted display
                                text: displayValue,
                                nonEditable: true,
                                style: cellStyle
                            } as TextCell;
                        }),
                        { type: "text" as const, text: "", nonEditable: true } // Empty result cell for metric rows
                    ]
                };
            });

            return [companyHeaderRow, ...metricRows];
        });

        return [headerRow, ...dataRows];
    }, [data, selectedQuarters, selectedMetrics, selectedCells, formulaResults, mode]);

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
