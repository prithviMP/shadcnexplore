import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ReactGrid, Column, Row, CellChange, TextCell, NumberCell, CellStyle } from "@silevis/reactgrid";
import "@silevis/reactgrid/styles.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Save, AlertCircle } from "lucide-react";
import type { Company } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

const FINANCIAL_FIELDS = [
  { key: "revenue", label: "Revenue", type: "number" },
  { key: "netIncome", label: "Net Income", type: "number" },
  { key: "roe", label: "ROE (%)", type: "number" },
  { key: "pe", label: "P/E Ratio", type: "number" },
  { key: "debt", label: "Debt Ratio", type: "number" },
];

export default function FinancialDataSpreadsheet() {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [editedData, setEditedData] = useState<Map<string, Record<string, any>>>(new Map());

  const { data: companies, isLoading, error } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updates = Array.from(editedData.entries()).map(([companyId, financialData]) => ({
        id: companyId,
        financialData,
      }));

      await Promise.all(
        updates.map((update) =>
          apiRequest(`/api/companies/${update.id}`, {
            method: "PATCH",
            body: JSON.stringify({ financialData: update.financialData }),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
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

  const getColumns = (): Column[] => [
    { columnId: "ticker", width: 120 },
    { columnId: "name", width: 250 },
    ...FINANCIAL_FIELDS.map((field) => ({
      columnId: field.key,
      width: 150,
    })),
  ];

  const getHeaderRow = (): Row => ({
    rowId: "header",
    cells: [
      { type: "header", text: "Ticker" } as TextCell,
      { type: "header", text: "Company Name" } as TextCell,
      ...FINANCIAL_FIELDS.map((field) => ({
        type: "header",
        text: field.label,
      } as TextCell)),
    ],
  });

  const getRows = (): Row[] => {
    if (!companies) return [];

    const headerRow = getHeaderRow();
    const dataRows = companies.map((company): Row => {
      const currentData = editedData.get(company.id);
      const isEdited = editedData.has(company.id);
      const financialData = currentData || (company.financialData as Record<string, number> | null) || {};

      // Highlight style for edited cells
      const editedStyle: CellStyle = {
        background: "rgba(59, 130, 246, 0.1)",
        border: {
          left: { color: "#3b82f6", width: "1px", style: "solid" },
          top: { color: "#3b82f6", width: "1px", style: "solid" },
          right: { color: "#3b82f6", width: "1px", style: "solid" },
          bottom: { color: "#3b82f6", width: "1px", style: "solid" },
        }
      };

      return {
        rowId: company.id,
        cells: [
          { type: "text", text: company.ticker, nonEditable: true } as TextCell,
          { type: "text", text: company.name, nonEditable: true } as TextCell,
          ...FINANCIAL_FIELDS.map((field) => {
            const value = financialData[field.key];
            return {
              type: "number",
              value: value !== undefined && value !== null ? Number(value) : null,
              style: isEdited ? editedStyle : undefined,
            } as NumberCell;
          }),
        ],
      };
    });

    return [headerRow, ...dataRows];
  };

  const handleChanges = (changes: CellChange[]) => {
    const newEditedData = new Map(editedData);

    changes.forEach((change) => {
      const companyId = change.rowId as string;
      if (companyId === "header") return;

      const company = companies.find((c) => c.id === companyId);
      if (!company) return;

      const columnId = change.columnId as string;
      const fieldIndex = FINANCIAL_FIELDS.findIndex((f) => f.key === columnId);
      if (fieldIndex === -1) return;

      // Guard against null financialData
      const existingFinancialData = company.financialData as Record<string, number> | null || {};
      const currentData = newEditedData.get(companyId) || { ...existingFinancialData };

      // Normalize number input: convert empty strings and NaN to null
      const newCell = change.newCell as NumberCell;
      let normalizedValue: number | null = null;
      
      if (newCell.value !== null && newCell.value !== undefined && newCell.value !== "") {
        const numValue = Number(newCell.value);
        normalizedValue = isNaN(numValue) ? null : numValue;
      }

      currentData[columnId] = normalizedValue;

      newEditedData.set(companyId, currentData);
    });

    setEditedData(newEditedData);
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate();
  };

  const handleDiscard = () => {
    setEditedData(new Map());
    setHasChanges(false);
    toast({
      title: "Changes Discarded",
      description: "All unsaved changes have been reverted",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Data Spreadsheet</h1>
          <p className="text-muted-foreground mt-1">
            Edit company financial metrics in Excel-like interface
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <>
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={updateMutation.isPending}
                data-testid="button-discard"
              >
                Discard Changes
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
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
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Company Financial Data</CardTitle>
          <CardDescription>
            Click any cell to edit. Changes are highlighted until saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="reactgrid-wrapper" data-testid="spreadsheet-grid">
            <ReactGrid
              rows={getRows()}
              columns={getColumns()}
              onCellsChanged={handleChanges}
              enableRowSelection
              enableColumnSelection
              stickyTopRows={1}
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
