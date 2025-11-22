import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, Loader2, Table2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CustomTable {
  id: string;
  name: string;
  tableType: "global" | "sector" | "company";
  sectorId: string | null;
  companyId: string | null;
  columns: any[];
  data: any[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function CustomTables() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<CustomTable | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    tableType: "global" as "global" | "sector" | "company",
    sectorId: "",
    companyId: "",
    columns: "",
    data: "",
  });

  const { data: tables = [], isLoading } = useQuery<CustomTable[]>({
    queryKey: ["/api/v1/tables"],
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ["/api/sectors"],
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["/api/companies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/v1/tables", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Table created",
        description: "Your custom table has been created successfully",
      });
      setIsCreateDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tables"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/v1/tables/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Table updated",
        description: "Your custom table has been updated successfully",
      });
      setEditingTable(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tables"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/tables/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Table deleted",
        description: "The custom table has been deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tables"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      tableType: "global",
      sectorId: "",
      companyId: "",
      columns: "",
      data: "",
    });
  };

  const handleCreate = () => {
    try {
      const columns = formData.columns ? JSON.parse(formData.columns) : [];
      const data = formData.data ? JSON.parse(formData.data) : [];

      const payload: any = {
        name: formData.name,
        tableType: formData.tableType,
        columns,
        data,
      };

      if (formData.tableType === "sector" && formData.sectorId) {
        payload.sectorId = formData.sectorId;
      }

      if (formData.tableType === "company" && formData.companyId) {
        payload.companyId = formData.companyId;
      }

      createMutation.mutate(payload);
    } catch (error: any) {
      toast({
        title: "Invalid JSON",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdate = () => {
    if (!editingTable) return;

    try {
      const columns = formData.columns ? JSON.parse(formData.columns) : editingTable.columns;
      const data = formData.data ? JSON.parse(formData.data) : editingTable.data;

      const payload: any = {
        name: formData.name || editingTable.name,
        columns,
        data,
      };

      updateMutation.mutate({ id: editingTable.id, data: payload });
    } catch (error: any) {
      toast({
        title: "Invalid JSON",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (table: CustomTable) => {
    setEditingTable(table);
    setFormData({
      name: table.name,
      tableType: table.tableType,
      sectorId: table.sectorId || "",
      companyId: table.companyId || "",
      columns: JSON.stringify(table.columns || [], null, 2),
      data: JSON.stringify(table.data || [], null, 2),
    });
    setIsCreateDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this table?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Custom Tables
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage custom tables with Excel-like functionality
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            resetForm();
            setEditingTable(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg">
              <Plus className="h-4 w-4 mr-2" />
              Create Table
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTable ? "Edit Table" : "Create New Table"}</DialogTitle>
              <DialogDescription>
                Create a custom table with Excel-like columns and data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Table Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Custom Table"
                />
              </div>

              <div>
                <Label htmlFor="tableType">Table Type</Label>
                <Select
                  value={formData.tableType}
                  onValueChange={(value: any) => setFormData({ ...formData, tableType: value, sectorId: "", companyId: "" })}
                >
                  <SelectTrigger id="tableType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="sector">Sector</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.tableType === "sector" && (
                <div>
                  <Label htmlFor="sectorId">Sector</Label>
                  <Select
                    value={formData.sectorId}
                    onValueChange={(value) => setFormData({ ...formData, sectorId: value })}
                  >
                    <SelectTrigger id="sectorId">
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((sector: any) => (
                        <SelectItem key={sector.id} value={sector.id}>
                          {sector.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.tableType === "company" && (
                <div>
                  <Label htmlFor="companyId">Company</Label>
                  <Select
                    value={formData.companyId}
                    onValueChange={(value) => setFormData({ ...formData, companyId: value })}
                  >
                    <SelectTrigger id="companyId">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company: any) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.ticker} - {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="columns">Columns (JSON)</Label>
                <Textarea
                  id="columns"
                  value={formData.columns}
                  onChange={(e) => setFormData({ ...formData, columns: e.target.value })}
                  placeholder='[{"name": "Quarter", "type": "text"}, {"name": "Revenue", "type": "number"}]'
                  className="font-mono text-sm min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Define table columns as JSON array with name and type
                </p>
              </div>

              <div>
                <Label htmlFor="data">Data (JSON)</Label>
                <Textarea
                  id="data"
                  value={formData.data}
                  onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  placeholder='[{"Quarter": "Q1 2024", "Revenue": 1000}, {"Quarter": "Q2 2024", "Revenue": 1200}]'
                  className="font-mono text-sm min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Define table data as JSON array of objects matching column names
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    resetForm();
                    setEditingTable(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={editingTable ? handleUpdate : handleCreate}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {editingTable ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          </CardContent>
        </Card>
      ) : tables.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Table2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No custom tables yet. Create your first table to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tables.map((table) => (
            <Card key={table.id} className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {table.name}
                      <Badge variant="secondary">{table.tableType}</Badge>
                    </CardTitle>
                    <CardDescription>
                      Created {new Date(table.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(table)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(table.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {table.columns && table.columns.length > 0 && table.data && table.data.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {table.columns.map((col: any, idx: number) => (
                            <TableHead key={idx}>{col.name}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {table.data.slice(0, 5).map((row: any, rowIdx: number) => (
                          <TableRow key={rowIdx}>
                            {table.columns.map((col: any, colIdx: number) => (
                              <TableCell key={colIdx}>
                                {row[col.name] !== undefined ? String(row[col.name]) : "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {table.data.length > 5 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Showing 5 of {table.data.length} rows
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data in this table</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

