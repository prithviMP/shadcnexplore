import { useState, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, X, Link as LinkIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { Sector, InsertSector } from "@shared/schema";

const sectorFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional()
});

type SectorFormData = z.infer<typeof sectorFormSchema>;

interface SectorMapping {
  id: string;
  screenerSector: string;
  customSectorId: string;
  createdAt: string;
}

export default function SectorManager() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editSector, setEditSector] = useState<Sector | null>(null);
  const [deleteSector, setDeleteSector] = useState<Sector | null>(null);
  const [selectedSectorForMapping, setSelectedSectorForMapping] = useState<Sector | null>(null);
  const [newScreenerSector, setNewScreenerSector] = useState("");
  const [sectorSearchTerm, setSectorSearchTerm] = useState("");
  const [sectorSortField, setSectorSortField] = useState<"name" | "description" | "companies">("name");
  const [sectorSortDirection, setSectorSortDirection] = useState<"asc" | "desc">("asc");

  const { data: sectors, isLoading } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  const { data: companies } = useQuery<Array<{ sectorId: string }>>({
    queryKey: ["/api/companies"]
  });

  // Fetch sector mappings for selected sector
  const { data: sectorMappings, refetch: refetchMappings } = useQuery<SectorMapping[]>({
    queryKey: ["/api/v1/sector-mappings", selectedSectorForMapping?.id],
    queryFn: async () => {
      if (!selectedSectorForMapping) return [];
      const res = await apiRequest("GET", `/api/v1/sector-mappings/${selectedSectorForMapping.id}`);
      return res.json();
    },
    enabled: !!selectedSectorForMapping,
  });

  const createMappingMutation = useMutation({
    mutationFn: (data: { screenerSector: string; customSectorId: string }) =>
      apiRequest("POST", "/api/v1/sector-mappings", data),
    onSuccess: () => {
      refetchMappings();
      setNewScreenerSector("");
      toast({ title: "Sector mapping created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create mapping", description: error.message, variant: "destructive" });
    }
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/v1/sector-mappings/${id}`),
    onSuccess: () => {
      refetchMappings();
      toast({ title: "Mapping deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete mapping", description: error.message, variant: "destructive" });
    }
  });

  const createForm = useForm<SectorFormData>({
    resolver: zodResolver(sectorFormSchema),
    defaultValues: { name: "", description: "" }
  });

  const editForm = useForm<SectorFormData>({
    resolver: zodResolver(sectorFormSchema)
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertSector) => apiRequest("POST", "/api/sectors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      toast({ title: "Sector created successfully" });
      setCreateOpen(false);
      createForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create sector", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertSector> }) =>
      apiRequest("PUT", `/api/sectors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      toast({ title: "Sector updated successfully" });
      setEditSector(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update sector", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sectors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Sector deleted successfully" });
      setDeleteSector(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete sector", description: error.message, variant: "destructive" });
    }
  });

  const deleteSectorWithCompaniesMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sectors/${id}/with-companies`),
    onSuccess: (data: { companiesDeleted: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({ 
        title: "Sector and companies deleted successfully",
        description: data.message
      });
      setDeleteSector(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete sector and companies", description: error.message, variant: "destructive" });
    }
  });

  const getCompanyCount = (sectorId: string) => {
    return companies?.filter(c => c.sectorId === sectorId).length || 0;
  };

  // Filter sectors by search term (name or description)
  const filteredSectors = useMemo(() => {
    if (!sectors) return [];
    const term = sectorSearchTerm.trim().toLowerCase();
    if (!term) return sectors;
    return sectors.filter(s =>
      s.name.toLowerCase().includes(term) ||
      (s.description ?? "").toLowerCase().includes(term)
    );
  }, [sectors, sectorSearchTerm]);

  // Sort sectors by selected column
  const sortedSectors = useMemo(() => {
    const base = filteredSectors || [];
    const sorted = [...base];

    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sectorSortField) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "description":
          aValue = (a.description ?? "").toLowerCase();
          bValue = (b.description ?? "").toLowerCase();
          break;
        case "companies":
          aValue = getCompanyCount(a.id);
          bValue = getCompanyCount(b.id);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sectorSortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sectorSortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredSectors, sectorSortField, sectorSortDirection, companies]);

  const handleSectorSort = (field: "name" | "description" | "companies") => {
    if (sectorSortField === field) {
      setSectorSortDirection(sectorSortDirection === "asc" ? "desc" : "asc");
    } else {
      setSectorSortField(field);
      setSectorSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: "name" | "description" | "companies" }) => {
    if (sectorSortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sectorSortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  const handleCreateSubmit = (data: SectorFormData) => {
    createMutation.mutate(data);
  };

  const handleEditSubmit = (data: SectorFormData) => {
    if (!editSector) return;
    updateMutation.mutate({ id: editSector.id, data });
  };

  const handleEdit = (sector: Sector) => {
    setEditSector(sector);
    editForm.reset({
      name: sector.name,
      description: sector.description || ""
    });
  };

  const handleAddMapping = () => {
    if (!selectedSectorForMapping || !newScreenerSector.trim()) {
      toast({ title: "Please enter a Screener.in sector name", variant: "destructive" });
      return;
    }
    createMappingMutation.mutate({
      screenerSector: newScreenerSector.trim(),
      customSectorId: selectedSectorForMapping.id,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sector Management</h1>
          <p className="text-muted-foreground mt-1">Manage industry sectors and classifications</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-sector">
              <Plus className="h-4 w-4 mr-2" />
              Create Sector
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-sector">
            <DialogHeader>
              <DialogTitle>Create New Sector</DialogTitle>
              <DialogDescription>Add a new industry sector to the system</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-sector-name" placeholder="e.g., Technology" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-sector-description" placeholder="Brief description of the sector" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-sector">
                    {createMutation.isPending ? "Creating..." : "Create Sector"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sectors</CardTitle>
          <CardDescription>
            {isLoading ? "Loading..." : `${sectors?.length || 0} sectors configured`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading sectors...</div>
          ) : !sectors || sectors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No sectors found. Create one to get started.</div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  {filteredSectors.length} sector{filteredSectors.length === 1 ? "" : "s"} shown
                </div>
                <div className="w-full sm:w-auto">
                  <Input
                    placeholder="Search sectors..."
                    value={sectorSearchTerm}
                    onChange={(e) => setSectorSearchTerm(e.target.value)}
                    className="w-full sm:w-[260px]"
                  />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSectorSort("name")}
                    >
                      <span className="inline-flex items-center">
                        Name
                        <SortIcon field="name" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSectorSort("description")}
                    >
                      <span className="inline-flex items-center">
                        Description
                        <SortIcon field="description" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSectorSort("companies")}
                    >
                      <span className="inline-flex items-center justify-end w-full">
                        Companies
                        <SortIcon field="companies" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSectors.map((sector) => (
                    <TableRow key={sector.id} data-testid={`row-sector-${sector.id}`}>
                      <TableCell className="font-medium">{sector.name}</TableCell>
                      <TableCell className="text-muted-foreground">{sector.description || "—"}</TableCell>
                      <TableCell className="text-right" data-testid={`text-sector-count-${sector.id}`}>
                        {getCompanyCount(sector.id)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(sector)}
                            data-testid={`button-edit-${sector.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteSector(sector)}
                            data-testid={`button-delete-${sector.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {selectedSectorForMapping && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sector Mappings: {selectedSectorForMapping.name}</CardTitle>
                <CardDescription>
                  Map multiple Screener.in sector names to this custom sector. This allows bulk scraping from multiple Screener.in sectors.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSectorForMapping(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter Screener.in sector name (e.g., IT, Banking, Energy)"
                value={newScreenerSector}
                onChange={(e) => setNewScreenerSector(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddMapping();
                  }
                }}
              />
              <Button
                onClick={handleAddMapping}
                disabled={createMappingMutation.isPending || !newScreenerSector.trim()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Mapping
              </Button>
            </div>

            {sectorMappings && sectorMappings.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Mapped Screener.in Sectors:</div>
                <div className="space-y-2">
                  {sectorMappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{mapping.screenerSector}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMappingMutation.mutate(mapping.id)}
                        disabled={deleteMappingMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No mappings yet. Add a Screener.in sector name to map it to this custom sector.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editSector} onOpenChange={(open) => !open && setEditSector(null)}>
        <DialogContent data-testid="dialog-edit-sector">
          <DialogHeader>
            <DialogTitle>Edit Sector</DialogTitle>
            <DialogDescription>Update sector information</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-edit-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditSector(null)} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Updating..." : "Update Sector"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSector} onOpenChange={(open) => !open && setDeleteSector(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sector</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSector && getCompanyCount(deleteSector.id) > 0 ? (
                <>
                  <p className="mb-2">
                    "{deleteSector.name}" has {getCompanyCount(deleteSector.id)} {getCompanyCount(deleteSector.id) === 1 ? 'company' : 'companies'} assigned to it.
                  </p>
                  <p className="mb-3 text-destructive font-medium">
                    You can either:
                  </p>
                  <ul className="list-disc list-inside space-y-1 mb-3 text-sm">
                    <li>Reassign or remove all companies from this sector first, then delete it</li>
                    <li>Delete the sector along with all its companies</li>
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Warning: Deleting the sector with companies will permanently remove all companies and their associated data (signals, quarterly data, etc.). This action cannot be undone.
                  </p>
                </>
              ) : (
                <>
                  Are you sure you want to delete "{deleteSector?.name}"? This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel data-testid="button-cancel-delete" className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            {deleteSector && getCompanyCount(deleteSector.id) > 0 ? (
              <AlertDialogAction
                onClick={() => {
                  if (deleteSector && confirm(`Are you sure you want to delete "${deleteSector.name}" along with all ${getCompanyCount(deleteSector.id)} ${getCompanyCount(deleteSector.id) === 1 ? 'company' : 'companies'}?\n\nThis will permanently delete:\n- The sector\n- All companies in this sector\n- All signals, quarterly data, and other associated data\n\nThis action CANNOT be undone.`)) {
                    deleteSectorWithCompaniesMutation.mutate(deleteSector.id);
                  }
                }}
                className="bg-red-600 text-white hover:bg-red-700 w-full sm:w-auto"
                data-testid="button-confirm-delete-with-companies"
                disabled={deleteSectorWithCompaniesMutation.isPending}
              >
                {deleteSectorWithCompaniesMutation.isPending ? "Deleting..." : `Delete Sector and All ${getCompanyCount(deleteSector.id)} ${getCompanyCount(deleteSector.id) === 1 ? 'Company' : 'Companies'}`}
              </AlertDialogAction>
            ) : (
            <AlertDialogAction
              onClick={() => deleteSector && deleteMutation.mutate(deleteSector.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
              data-testid="button-confirm-delete"
                disabled={deleteMutation.isPending}
            >
                {deleteMutation.isPending ? "Deleting..." : "Delete Sector"}
            </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
