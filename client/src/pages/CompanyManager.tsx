import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Upload, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import type { Company, Sector, InsertCompany } from "@shared/schema";

const companyFormSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  name: z.string().min(1, "Name is required"),
  sectorId: z.string().min(1, "Sector is required"),
  marketCap: z.string().optional(),
  financialData: z.string().optional()
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

export default function CompanyManager() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [bulkData, setBulkData] = useState("");

  const companiesQueryKey = selectedSector 
    ? ["/api/companies", { sectorId: selectedSector }]
    : ["/api/companies"];

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: companiesQueryKey
  });

  const { data: sectors } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  const createForm = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: { ticker: "", name: "", sectorId: "", marketCap: "", financialData: "" }
  });

  const editForm = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema)
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertCompany) => apiRequest("/api/companies", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company created successfully" });
      setCreateOpen(false);
      createForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create company", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertCompany> }) =>
      apiRequest(`/api/companies/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company updated successfully" });
      setEditCompany(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update company", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/companies/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company deleted successfully" });
      setDeleteCompany(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete company", description: error.message, variant: "destructive" });
    }
  });

  const bulkImportMutation = useMutation({
    mutationFn: (companies: InsertCompany[]) => 
      apiRequest("/api/companies/bulk", "POST", { companies }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: `Successfully imported ${result.count} companies` });
      setBulkOpen(false);
      setBulkData("");
    },
    onError: (error: Error) => {
      toast({ title: "Bulk import failed", description: error.message, variant: "destructive" });
    }
  });

  const parseFinancialData = (jsonString: string) => {
    if (!jsonString || jsonString.trim() === "") return null;
    try {
      return JSON.parse(jsonString);
    } catch {
      throw new Error("Invalid JSON format for financial data");
    }
  };

  const handleCreateSubmit = (data: CompanyFormData) => {
    try {
      const insertData: InsertCompany = {
        ticker: data.ticker,
        name: data.name,
        sectorId: data.sectorId,
        marketCap: data.marketCap ? data.marketCap : undefined,
        financialData: parseFinancialData(data.financialData || "")
      };
      createMutation.mutate(insertData);
    } catch (error: any) {
      toast({ title: "Validation error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditSubmit = (data: CompanyFormData) => {
    if (!editCompany) return;
    try {
      const updateData: Partial<InsertCompany> = {
        ticker: data.ticker,
        name: data.name,
        sectorId: data.sectorId,
        marketCap: data.marketCap ? data.marketCap : undefined,
        financialData: parseFinancialData(data.financialData || "")
      };
      updateMutation.mutate({ id: editCompany.id, data: updateData });
    } catch (error: any) {
      toast({ title: "Validation error", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (company: Company) => {
    setEditCompany(company);
    editForm.reset({
      ticker: company.ticker,
      name: company.name,
      sectorId: company.sectorId,
      marketCap: company.marketCap?.toString() || "",
      financialData: company.financialData ? JSON.stringify(company.financialData, null, 2) : ""
    });
  };

  const handleBulkImport = () => {
    try {
      const parsedData = JSON.parse(bulkData);
      const companies = Array.isArray(parsedData) ? parsedData : [parsedData];
      
      const validatedCompanies = companies.map((c: any) => ({
        ticker: c.ticker,
        name: c.name,
        sectorId: c.sectorId,
        marketCap: c.marketCap || undefined,
        financialData: c.financialData || null
      }));

      bulkImportMutation.mutate(validatedCompanies);
    } catch (error: any) {
      toast({ title: "Invalid JSON", description: error.message, variant: "destructive" });
    }
  };

  const getSectorName = (sectorId: string) => {
    return sectors?.find(s => s.id === sectorId)?.name || "Unknown";
  };

  const getFinancialValue = (company: Company, key: string): string => {
    if (!company.financialData) return "—";
    const data = company.financialData as any;
    return data[key] !== undefined ? String(data[key]) : "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Company Management</h1>
          <p className="text-muted-foreground mt-1">Manage companies and their financial data</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-bulk-import">
                <Upload className="h-4 w-4 mr-2" />
                Bulk Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="dialog-bulk-import">
              <DialogHeader>
                <DialogTitle>Bulk Import Companies</DialogTitle>
                <DialogDescription>Import multiple companies from JSON data</DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="json">
                <TabsList className="grid w-full grid-cols-1">
                  <TabsTrigger value="json">JSON Upload</TabsTrigger>
                </TabsList>
                <TabsContent value="json" className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">JSON Data</label>
                    <Textarea
                      placeholder='[{"ticker": "AAPL", "name": "Apple Inc.", "sectorId": "...", "marketCap": "2500000000000", "financialData": {"revenue": 394328, "roe": 147.3}}]'
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      className="font-mono text-xs min-h-[300px]"
                      data-testid="input-bulk-json"
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste an array of company objects. Each must include: ticker, name, sectorId
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setBulkOpen(false)} data-testid="button-cancel-bulk">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleBulkImport}
                      disabled={bulkImportMutation.isPending}
                      data-testid="button-submit-bulk"
                    >
                      {bulkImportMutation.isPending ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-company">
                <Plus className="h-4 w-4 mr-2" />
                Create Company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="dialog-create-company">
              <DialogHeader>
                <DialogTitle>Create New Company</DialogTitle>
                <DialogDescription>Add a new company to the system</DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="ticker"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ticker</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-company-ticker" placeholder="AAPL" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="sectorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sector</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sector">
                                <SelectValue placeholder="Select sector" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {sectors?.map((sector) => (
                                <SelectItem key={sector.id} value={sector.id}>
                                  {sector.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-company-name" placeholder="Apple Inc." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="marketCap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Market Cap (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-market-cap" placeholder="2500000000000" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="financialData"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Financial Data (JSON, Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            data-testid="input-financial-data"
                            placeholder='{"revenue": 394328, "roe": 147.3, "pe": 28.5}'
                            className="font-mono text-xs"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-company">
                      {createMutation.isPending ? "Creating..." : "Create Company"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Companies</CardTitle>
              <CardDescription>
                {isLoading ? "Loading..." : `${companies?.length || 0} companies`}
              </CardDescription>
            </div>
            <Select value={selectedSector} onValueChange={setSelectedSector}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-sector">
                <SelectValue placeholder="All sectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All sectors</SelectItem>
                {sectors?.map((sector) => (
                  <SelectItem key={sector.id} value={sector.id}>
                    {sector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading companies...</div>
          ) : !companies || companies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No companies found. {selectedSector ? "Try selecting a different sector." : "Create one to get started."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">ROE %</TableHead>
                    <TableHead className="text-right">P/E</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id} data-testid={`row-company-${company.ticker}`}>
                      <TableCell className="font-mono font-bold">
                        <Link href={`/company/${company.ticker}`}>
                          <button className="hover:text-primary transition-colors flex items-center gap-1" data-testid={`link-company-${company.ticker}`}>
                            {company.ticker}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </Link>
                      </TableCell>
                      <TableCell>{company.name}</TableCell>
                      <TableCell className="text-muted-foreground">{getSectorName(company.sectorId)}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "revenue")}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "roe")}</TableCell>
                      <TableCell className="text-right font-mono">{getFinancialValue(company, "pe")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(company)}
                            data-testid={`button-edit-${company.ticker}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteCompany(company)}
                            data-testid={`button-delete-${company.ticker}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editCompany} onOpenChange={(open) => !open && setEditCompany(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-company">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update company information</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="ticker"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticker</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-ticker" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="sectorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sector</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-sector">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sectors?.map((sector) => (
                            <SelectItem key={sector.id} value={sector.id}>
                              {sector.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="marketCap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Market Cap (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-market-cap" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="financialData"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Financial Data (JSON, Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="input-edit-financial-data"
                        className="font-mono text-xs min-h-[120px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditCompany(null)} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Updating..." : "Update Company"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCompany} onOpenChange={(open) => !open && setDeleteCompany(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteCompany?.ticker} - {deleteCompany?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCompany && deleteMutation.mutate(deleteCompany.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
