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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Sector, InsertSector } from "@shared/schema";

const sectorFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional()
});

type SectorFormData = z.infer<typeof sectorFormSchema>;

export default function SectorManager() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editSector, setEditSector] = useState<Sector | null>(null);
  const [deleteSector, setDeleteSector] = useState<Sector | null>(null);

  const { data: sectors, isLoading } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"]
  });

  const { data: companies } = useQuery<Array<{ sectorId: string }>>({
    queryKey: ["/api/companies"]
  });

  const createForm = useForm<SectorFormData>({
    resolver: zodResolver(sectorFormSchema),
    defaultValues: { name: "", description: "" }
  });

  const editForm = useForm<SectorFormData>({
    resolver: zodResolver(sectorFormSchema)
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertSector) => apiRequest("/api/sectors", "POST", data),
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
      apiRequest(`/api/sectors/${id}`, "PUT", data),
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
    mutationFn: (id: string) => apiRequest(`/api/sectors/${id}`, "DELETE"),
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

  const getCompanyCount = (sectorId: string) => {
    return companies?.filter(c => c.sectorId === sectorId).length || 0;
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Companies</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sectors.map((sector) => (
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
          )}
        </CardContent>
      </Card>

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
              Are you sure you want to delete "{deleteSector?.name}"? This action cannot be undone.
              {deleteSector && getCompanyCount(deleteSector.id) > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This sector has {getCompanyCount(deleteSector.id)} companies.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSector && deleteMutation.mutate(deleteSector.id)}
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
