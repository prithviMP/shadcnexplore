import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ReactGrid, Column, Row, CellChange, TextCell, NumberCell, CellStyle } from "@silevis/reactgrid";
import "@silevis/reactgrid/styles.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Save, AlertCircle, Settings, Copy, Clipboard } from "lucide-react";
import type { Company } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { evaluateFormula, parseCellReference, cellReferenceToString } from "@/utils/formulaEvaluator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ColumnConfig {
  id: string;
  label: string;
  type: "text" | "number" | "formula" | "quarterly";
  key?: string; // For financial data fields
  quarter?: string; // For quarterly columns
  width: number;
  visible: boolean;
}

const BASE_FINANCIAL_FIELDS: ColumnConfig[] = [
  { id: "ticker", label: "Ticker", type: "text", width: 120, visible: true },
  { id: "name", label: "Company Name", type: "text", width: 250, visible: true },
  { id: "revenue", label: "Revenue", type: "number", key: "revenue", width: 150, visible: true },
  { id: "netIncome", label: "Net Income", type: "number", key: "netIncome", width: 150, visible: true },
  { id: "roe", label: "ROE (%)", type: "number", key: "roe", width: 120, visible: true },
  { id: "pe", label: "P/E Ratio", type: "number", key: "pe", width: 120, visible: true },
  { id: "debt", label: "Debt Ratio", type: "number", key: "debt", width: 120, visible: true },
];

interface CellData {
  value: number | string | null;
  formula?: string;
  isFormula: boolean;
}

interface QuarterlyData {
  [ticker: string]: {
    [quarter: string]: {
      [metric: string]: number | null;
    };
  };
}

export default function FinancialDataSpreadsheet() {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [editedData, setEditedData] = useState<Map<string, Map<string, CellData>>>(new Map());
  const [columns, setColumns] = useState<ColumnConfig[]>(BASE_FINANCIAL_FIELDS);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<string[][]>([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number; companyId?: string; columnId?: string } | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState<string>("");

  const { data: companies, isLoading, error } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  // Fetch quarterly data for all companies
  const { data: quarterlyDataMap } = useQuery<QuarterlyData>({
    queryKey: ["quarterly-data-all"],
    queryFn: async () => {
      if (!companies || companies.length === 0) return {};
      
      const data: QuarterlyData = {};
      await Promise.all(
        companies.map(async (company) => {
          try {
            const res = await apiRequest("GET", `/api/v1/companies/${company.ticker}/data`);
            const result = await res.json();
            data[company.ticker] = {};
            
            // Group by quarter
            if (result.data) {
              result.data.forEach((item: any) => {
                if (!data[company.ticker][item.quarter]) {
                  data[company.ticker][item.quarter] = {};
                }
                data[company.ticker][item.quarter][item.metricName] = item.metricValue;
              });
            }
          } catch (error) {
            // Ignore errors for individual companies
          }
        })
      );
      
      return data;
    },
    enabled: !!companies && companies.length > 0,
  });

  // Get unique quarters from all companies
  const availableQuarters = useMemo(() => {
    if (!quarterlyDataMap) return [];
    const quarters = new Set<string>();
    Object.values(quarterlyDataMap).forEach((companyData) => {
      Object.keys(companyData).forEach((quarter) => quarters.add(quarter));
    });
    return Array.from(quarters).sort().reverse(); // Most recent first
  }, [quarterlyDataMap]);

  // Add quarterly columns if they don't exist
  useEffect(() => {
    if (availableQuarters.length > 0) {
      setColumns((prev) => {
        const existingQuarterIds = prev.filter((c) => c.type === "quarterly").map((c) => c.id);
        const newQuarterColumns = availableQuarters
          .filter((q) => !existingQuarterIds.includes(`quarter-${q}`))
          .map((quarter) => ({
            id: `quarter-${quarter}`,
            label: quarter,
            type: "quarterly" as const,
            quarter,
            width: 120,
            visible: true,
          }));
        return [...prev, ...newQuarterColumns];
      });
    }
  }, [availableQuarters]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updates: Array<{ id: string; financialData: any; quarterlyData?: any }> = [];

      editedData.forEach((rowData, companyId) => {
        const company = companies?.find((c) => c.id === companyId);
        if (!company) return;

        const financialData: any = {};
        const quarterlyUpdates: any = {};

        rowData.forEach((cellData, columnId) => {
          const column = columns.find((c) => c.id === columnId);
          if (!column) return;

          if (column.type === "number" && column.key) {
            financialData[column.key] = cellData.value;
          } else if (column.type === "quarterly" && column.quarter) {
            if (!quarterlyUpdates[column.quarter]) {
              quarterlyUpdates[column.quarter] = {};
            }
            // Store as revenue for now (can be extended)
            quarterlyUpdates[column.quarter].revenue = cellData.value;
          }
        });

        if (Object.keys(financialData).length > 0) {
          updates.push({ id: companyId, financialData });
        }

        if (Object.keys(quarterlyUpdates).length > 0) {
          updates.push({ id: companyId, financialData: {}, quarterlyData: quarterlyUpdates });
        }
      });

      await Promise.all(
        updates.map(async (update) => {
          if (Object.keys(update.financialData).length > 0) {
            await apiRequest("PUT", `/api/companies/${update.id}`, { financialData: update.financialData });
          }
          // TODO: Add quarterly data update endpoint
          })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["quarterly-data-all"] });
      setEditedData(new Map());
      setHasChanges(false);
      toast({
        title: "Success",
        description: "Financial data updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update financial data",
        variant: "destructive",
      });
    },
  });

  const getCellValue = useCallback(
    (row: number, col: number): number | string | null => {
      if (row === 0) return null; // Header row
      if (!companies) return null;

      const companyIndex = row - 1;
      if (companyIndex < 0 || companyIndex >= companies.length) return null;

      const company = companies[companyIndex];
      const column = columns[col];
      if (!column) return null;

      // Check if cell has been edited
      const rowData = editedData.get(company.id);
      if (rowData) {
        const cellData = rowData.get(column.id);
        if (cellData) {
          if (cellData.isFormula && cellData.formula) {
            // Evaluate formula
            const result = evaluateFormula(cellData.formula, (r, c) => getCellValue(r, c));
            return result.value;
          }
          return cellData.value;
        }
      }

      // Get original value
      if (column.type === "text") {
        if (column.id === "ticker") return company.ticker;
        if (column.id === "name") return company.name;
      } else if (column.type === "number" && column.key) {
        const financialData = company.financialData as Record<string, number> | null;
        return financialData?.[column.key] ?? null;
      } else if (column.type === "quarterly" && column.quarter) {
        const quarterData = quarterlyDataMap?.[company.ticker]?.[column.quarter];
        return quarterData?.revenue ?? null;
      }

      return null;
    },
    [companies, columns, editedData, quarterlyDataMap]
  );

  const getColumns = (): Column[] => {
    return columns
      .filter((col) => col.visible)
      .map((col) => ({
        columnId: col.id,
        width: col.width,
      }));
  };

  const getHeaderRow = (): Row => ({
    rowId: "header",
    cells: columns
      .filter((col) => col.visible)
      .map((col) => ({
        type: "header",
        text: col.label,
      } as TextCell)),
  });

  const getRows = (): Row[] => {
    if (!companies) return [getHeaderRow()];

    const headerRow = getHeaderRow();
    const visibleColumns = columns.filter((col) => col.visible);

    const dataRows = companies.map((company, companyIndex): Row => {
      const rowData = editedData.get(company.id) || new Map();
      const isRowEdited = editedData.has(company.id);

      const editedStyle: CellStyle = {
        background: "rgba(59, 130, 246, 0.1)",
        border: {
          left: { color: "#3b82f6", width: "1px", style: "solid" },
          top: { color: "#3b82f6", width: "1px", style: "solid" },
          right: { color: "#3b82f6", width: "1px", style: "solid" },
          bottom: { color: "#3b82f6", width: "1px", style: "solid" },
        },
      };

      const cells = visibleColumns.map((column, colIndex) => {
        const cellData = rowData.get(column.id);
        const cellKey = `${companyIndex + 1}-${colIndex}`;
        const isSelected = selectedCells.has(cellKey);

        if (column.type === "text") {
          let value = "";
          if (column.id === "ticker") value = company.ticker;
          else if (column.id === "name") value = company.name;

          return {
            type: "text",
            text: value,
            nonEditable: true,
            style: isSelected ? editedStyle : undefined,
          } as TextCell;
        }

        // Handle formulas - display calculated value but store formula
        if (cellData?.isFormula && cellData.formula) {
          const result = evaluateFormula(cellData.formula, (r, c) => getCellValue(r, c));
          const displayValue = typeof result.value === "number" ? result.value : null;
          return {
            type: "number",
            value: displayValue,
            style: isRowEdited ? editedStyle : undefined,
            // Store formula in a custom property for editing
          } as NumberCell & { _formula?: string; _error?: string };
        }

        // Handle regular number cells
        let value: number | null = null;
        if (cellData) {
          value = typeof cellData.value === "number" ? cellData.value : null;
        } else {
          if (column.type === "number" && column.key) {
            const financialData = company.financialData as Record<string, number> | null;
            value = financialData?.[column.key] ?? null;
          } else if (column.type === "quarterly" && column.quarter) {
            const quarterData = quarterlyDataMap?.[company.ticker]?.[column.quarter];
            value = quarterData?.revenue ?? null;
          }
        }

        return {
          type: "number",
          value,
          style: isRowEdited ? editedStyle : undefined,
        } as NumberCell;
      });

      return {
        rowId: company.id,
        cells,
      };
    });

    return [headerRow, ...dataRows];
  };

  const handleChanges = (changes: CellChange[]) => {
    const newEditedData = new Map(editedData);
    const newSelectedCells = new Set<string>();

    changes.forEach((change) => {
      const companyId = change.rowId as string;
      if (companyId === "header") return;

      const company = companies?.find((c) => c.id === companyId);
      if (!company) return;

      const columnId = change.columnId as string;
      const column = columns.find((c) => c.id === columnId);
      if (!column || column.type === "text") return;

      const companyIndex = companies.findIndex((c) => c.id === companyId);
      const colIndex = columns.findIndex((c) => c.id === columnId);
      const cellKey = `${companyIndex + 1}-${colIndex}`;
      newSelectedCells.add(cellKey);

      let rowData = newEditedData.get(companyId);
      if (!rowData) {
        rowData = new Map();
        newEditedData.set(companyId, rowData);
      }

      const newCell = change.newCell as NumberCell | TextCell;
      let cellData: CellData;

      // Check if it's a formula - ReactGrid NumberCell doesn't support formulas directly
      // We need to detect when user enters a formula string
      // For now, we'll use a workaround: if the value is a string that starts with =, it's a formula
      // In practice, users will need to enter formulas in a formula bar (to be added)
      
      // Check if it's a TextCell with formula
      if (newCell.type === "text" && "text" in newCell) {
        const text = newCell.text?.trim() || "";
        if (text.startsWith("=")) {
          cellData = {
            value: null,
            formula: text,
            isFormula: true,
          };
        } else {
          // Try to parse as number
          const numValue = parseFloat(text);
          cellData = {
            value: isNaN(numValue) ? null : numValue,
            isFormula: false,
          };
        }
      } else if (newCell.type === "number" && "value" in newCell) {
        // Regular number cell
      let normalizedValue: number | null = null;
      if (newCell.value !== null && newCell.value !== undefined && newCell.value !== "") {
        const numValue = Number(newCell.value);
        normalizedValue = isNaN(numValue) ? null : numValue;
      }
        cellData = {
          value: normalizedValue,
          isFormula: false,
        };
      } else {
        // Default
        cellData = {
          value: null,
          isFormula: false,
        };
      }

      rowData.set(columnId, cellData);
    });

    setEditedData(newEditedData);
    setSelectedCells(newSelectedCells);
    setHasChanges(true);
  };


  // Copy/paste functionality
  const handleCopy = useCallback(() => {
    if (selectedCells.size === 0) {
      toast({
        title: "No selection",
        description: "Please select cells to copy",
        variant: "destructive",
      });
      return;
    }

    const cells = Array.from(selectedCells);
    const rows = new Map<number, Map<number, string>>();

    cells.forEach((cellKey) => {
      const [rowStr, colStr] = cellKey.split("-");
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);

      if (!rows.has(row)) rows.set(row, new Map());
      const value = getCellValue(row, col);
      rows.get(row)!.set(col, value !== null ? String(value) : "");
    });

    const minRow = Math.min(...Array.from(rows.keys()));
    const maxRow = Math.max(...Array.from(rows.keys()));
    const minCol = Math.min(...Array.from(rows.values()).flatMap((m) => Array.from(m.keys())));
    const maxCol = Math.max(...Array.from(rows.values()).flatMap((m) => Array.from(m.keys())));

    const clipboardData: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const rowMap = rows.get(r);
        row.push(rowMap?.get(c) || "");
      }
      clipboardData.push(row);
    }

    setClipboard(clipboardData);
    navigator.clipboard.writeText(clipboardData.map((row) => row.join("\t")).join("\n"));
    toast({
      title: "Copied",
      description: `Copied ${cells.length} cell(s) to clipboard`,
    });
  }, [selectedCells, getCellValue, toast]);

  const pasteData = useCallback((data: string[][]) => {
    if (selectedCells.size === 0 || data.length === 0) return;

    const cells = Array.from(selectedCells);
    const firstCell = cells[0];
    const [startRowStr, startColStr] = firstCell.split("-");
    const startRow = parseInt(startRowStr, 10);
    const startCol = parseInt(startColStr, 10);

    const newEditedData = new Map(editedData);
    const visibleColumns = columns.filter((col) => col.visible);

    data.forEach((row, rowOffset) => {
      row.forEach((value, colOffset) => {
        const targetRow = startRow + rowOffset;
        const targetCol = startCol + colOffset;

        if (targetRow === 0) return; // Can't paste into header
        if (targetRow > companies!.length) return;
        if (targetCol >= visibleColumns.length) return;

        const company = companies![targetRow - 1];
        const column = visibleColumns[targetCol];
        if (!company || !column || column.type === "text") return;

        let rowData = newEditedData.get(company.id);
        if (!rowData) {
          rowData = new Map();
          newEditedData.set(company.id, rowData);
        }

        // Check if value is a formula
        const trimmedValue = value.trim();
        let cellData: CellData;

        if (trimmedValue.startsWith("=")) {
          cellData = {
            value: null,
            formula: trimmedValue,
            isFormula: true,
          };
        } else if (trimmedValue === "") {
          cellData = {
            value: null,
            isFormula: false,
          };
        } else {
          const numValue = parseFloat(trimmedValue);
          cellData = {
            value: isNaN(numValue) ? null : numValue,
            isFormula: false,
          };
        }

        rowData.set(column.id, cellData);
      });
    });

    setEditedData(newEditedData);
    setHasChanges(true);
    toast({
      title: "Pasted",
      description: `Pasted ${data.length} row(s)`,
    });
  }, [selectedCells, companies, columns, editedData, toast]);

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) {
      navigator.clipboard.readText().then((text) => {
        const rows = text.split("\n").map((row) => row.split("\t"));
        setClipboard(rows);
        pasteData(rows);
      });
    } else {
      pasteData(clipboard);
    }
  }, [clipboard, pasteData]);

  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+C or Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedCells.size > 0) {
        e.preventDefault();
        handleCopy();
      }
      // Ctrl+V or Cmd+V
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        handlePaste();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCells.size, handleCopy, handlePaste]);

  const handleSave = () => {
    updateMutation.mutate();
  };

  const handleDiscard = () => {
    setEditedData(new Map());
    setSelectedCells(new Set());
    setHasChanges(false);
    toast({
      title: "Changes Discarded",
      description: "All unsaved changes have been reverted",
    });
  };

  const toggleColumnVisibility = (columnId: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, visible: !col.visible } : col))
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (error || !companies) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load company data. {error instanceof Error ? error.message : ""}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Data Spreadsheet</h1>
          <p className="text-muted-foreground mt-1">
            Edit company financial metrics in Excel-like interface with formulas and quarterly data
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showColumnSettings} onOpenChange={setShowColumnSettings}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Column Settings</DialogTitle>
                <DialogDescription>Show or hide columns</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                {columns.map((column) => (
                  <div key={column.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={column.id}
                      checked={column.visible}
                      onCheckedChange={() => toggleColumnVisibility(column.id)}
                    />
                    <Label htmlFor={column.id} className="cursor-pointer flex-1">
                      {column.label}
                    </Label>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button variant="outline" onClick={handlePaste}>
            <Clipboard className="h-4 w-4 mr-2" />
            Paste
          </Button>
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleDiscard} disabled={updateMutation.isPending}>
                Discard Changes
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to persist them to the database.
            <br />
            <span className="text-xs mt-1 block">
              Tip: Enter formulas starting with = (e.g., =SUM(A1:A10), =IF(A1&gt;10, "High", "Low"))
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Company Financial Data</CardTitle>
          <CardDescription>
            Click any cell to edit. Enter formulas starting with = (e.g., =SUM(A1:A10), =IF(A1&gt;10, "High", "Low")).
            <br />
            <span className="text-xs">Use Copy/Paste buttons or Ctrl+C/Ctrl+V. Formulas are evaluated automatically.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formula Bar */}
          {activeCell && (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-slate-50 dark:bg-slate-900">
              <span className="text-sm font-mono font-semibold min-w-[60px]">
                {activeCell.companyId && activeCell.columnId
                  ? cellReferenceToString(activeCell.row, activeCell.col)
                  : ""}
              </span>
              <span className="text-muted-foreground">:</span>
              <input
                type="text"
                value={formulaBarValue}
                onChange={(e) => setFormulaBarValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && activeCell.companyId && activeCell.columnId) {
                    // Apply formula/value to cell
                    const newEditedData = new Map(editedData);
                    let rowData = newEditedData.get(activeCell.companyId);
                    if (!rowData) {
                      rowData = new Map();
                      newEditedData.set(activeCell.companyId, rowData);
                    }
                    
                    const trimmed = formulaBarValue.trim();
                    if (trimmed.startsWith("=")) {
                      rowData.set(activeCell.columnId, {
                        value: null,
                        formula: trimmed,
                        isFormula: true,
                      });
                    } else if (trimmed === "") {
                      rowData.delete(activeCell.columnId);
                    } else {
                      const numValue = parseFloat(trimmed);
                      rowData.set(activeCell.columnId, {
                        value: isNaN(numValue) ? null : numValue,
                        isFormula: false,
                      });
                    }
                    
                    setEditedData(newEditedData);
                    setHasChanges(true);
                    setActiveCell(null);
                    setFormulaBarValue("");
                  } else if (e.key === "Escape") {
                    setActiveCell(null);
                    setFormulaBarValue("");
                  }
                }}
                placeholder="Enter value or formula (e.g., 100 or =SUM(A1:A10))"
                className="flex-1 px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-slate-800 font-mono"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveCell(null);
                  setFormulaBarValue("");
                }}
              >
                ×
              </Button>
            </div>
          )}
          
          <div className="reactgrid-wrapper" style={{ height: "600px", overflow: "auto" }}>
            <ReactGrid
              rows={getRows()}
              columns={getColumns()}
              onCellsChanged={(changes) => {
                // Set active cell for formula bar
                if (changes.length > 0) {
                  const change = changes[0];
                  const companyId = change.rowId as string;
                  const columnId = change.columnId as string;
                  
                  if (companyId !== "header") {
                    const companyIndex = companies?.findIndex((c) => c.id === companyId) ?? -1;
                    const colIndex = columns.findIndex((c) => c.id === columnId);
                    
                    if (companyIndex >= 0 && colIndex >= 0) {
                      const rowData = editedData.get(companyId);
                      const cellData = rowData?.get(columnId);
                      
                      setActiveCell({
                        row: companyIndex + 1,
                        col: colIndex,
                        companyId,
                        columnId,
                      });
                      
                      if (cellData?.isFormula) {
                        setFormulaBarValue(cellData.formula || "");
                      } else {
                        setFormulaBarValue(cellData?.value?.toString() || "");
                      }
                    }
                  }
                }
                
                handleChanges(changes);
              }}
              enableRowSelection
              enableColumnSelection
              stickyTopRows={1}
              enableRangeSelection
            />
          </div>
        </CardContent>
      </Card>

      {companies.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No companies found. Add companies in the Company Manager to begin editing financial data.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
