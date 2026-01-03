import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, ShieldCheck, Shield } from "lucide-react";

type Permission = string;

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: string;
  userCount?: number;
}

interface PermissionsResponse {
  permissions: Permission[];
}

interface RoleFormState {
  name: string;
  description: string;
  permissions: Permission[];
}

export default function Roles() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [createForm, setCreateForm] = useState<RoleFormState>({
    name: "",
    description: "",
    permissions: [],
  });
  const [editForm, setEditForm] = useState<RoleFormState>({
    name: "",
    description: "",
    permissions: [],
  });

  const { data: roles, isLoading: rolesLoading, error: rolesError } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: permissionsData, isLoading: permsLoading, error: permsError } = useQuery<PermissionsResponse>({
    queryKey: ["/api/permissions"],
  });

  const allPermissions = permissionsData?.permissions ?? [];

  const permissionsByGroup = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const perm of allPermissions) {
      const [groupRaw] = perm.split(":");
      const groupKey = groupRaw || "other";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(perm);
    }
    return groups;
  }, [allPermissions]);

  const createRoleMutation = useMutation({
    mutationFn: async (data: RoleFormState) => {
      await apiRequest("POST", "/api/roles", {
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        permissions: data.permissions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setCreateDialogOpen(false);
      setCreateForm({ name: "", description: "", permissions: [] });
      toast({
        title: "Role created",
        description: "New role has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create role",
        description: error?.message || "An error occurred while creating the role.",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (data: RoleFormState) => {
      if (!editingRole) return;
      await apiRequest("PUT", `/api/roles/${encodeURIComponent(editingRole.id)}`, {
        description: data.description.trim() || undefined,
        permissions: data.permissions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setEditDialogOpen(false);
      setEditingRole(null);
      toast({
        title: "Role updated",
        description: "Role permissions have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update role",
        description: error?.message || "An error occurred while updating the role.",
        variant: "destructive",
      });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await apiRequest("DELETE", `/api/roles/${encodeURIComponent(roleId)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({
        title: "Role deleted",
        description: "Role has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete role",
        description: error?.message || "An error occurred while deleting the role.",
        variant: "destructive",
      });
    },
  });

  const togglePermissionInForm = (form: RoleFormState, setForm: (value: RoleFormState) => void, permission: Permission) => {
    const hasPermission = form.permissions.includes(permission);
    const newPermissions = hasPermission
      ? form.permissions.filter((p) => p !== permission)
      : [...form.permissions, permission];
    setForm({ ...form, permissions: newPermissions });
  };

  const openEditDialog = (role: Role) => {
    setEditingRole(role);
    setEditForm({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions ?? [],
    });
    setEditDialogOpen(true);
  };

  const handleDeleteRole = (role: Role) => {
    // Prevent deletion of super_admin role specifically
    if (role.name === "super_admin") {
      toast({
        title: "Cannot delete super_admin role",
        description: "The super_admin role cannot be deleted.",
        variant: "destructive",
      });
      return;
    }

    if (role.isSystem) {
      toast({
        title: "Cannot delete system role",
        description: "System roles like Admin or Viewer cannot be deleted.",
        variant: "destructive",
      });
      return;
    }

    if (role.userCount && role.userCount > 0) {
      toast({
        title: "Cannot delete role",
        description: "This role is currently assigned to users. Reassign users before deleting.",
        variant: "destructive",
      });
      return;
    }

    if (confirm(`Are you sure you want to delete the role "${role.name}"?`)) {
      deleteRoleMutation.mutate(role.id);
    }
  };

  if (rolesLoading || permsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (rolesError || permsError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load roles or permissions.{" "}
          {rolesError instanceof Error ? rolesError.message : ""}
          {permsError instanceof Error ? ` ${permsError.message}` : ""}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Role Management</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage roles and their permissions.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Role
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Overview of all roles and their permissions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles && roles.length > 0 ? (
                  roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium capitalize">{role.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {role.description || "—"}
                      </TableCell>
                      <TableCell>
                        {role.isSystem ? (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            System
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Custom
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{role.userCount ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(role.permissions || []).slice(0, 6).map((perm) => (
                            <Badge key={perm} variant="outline" className="text-xs">
                              {perm}
                            </Badge>
                          ))}
                          {role.permissions && role.permissions.length > 6 && (
                            <span className="text-xs text-muted-foreground">
                              +{role.permissions.length - 6} more
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(role)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!role.isSystem && role.name !== "super_admin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteRole(role)}
                              disabled={deleteRoleMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      No roles found. Create a role to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Role Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Define a new role and choose which permissions it should have.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
            <div className="space-y-4 md:col-span-1">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  placeholder="e.g. manager"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Description</Label>
                <Input
                  id="role-description"
                  placeholder="Short description of this role"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-4 md:col-span-2">
              <Label>Permissions</Label>
              <div className="border rounded-md p-3 max-h-[360px] overflow-y-auto space-y-3">
                {Object.entries(permissionsByGroup).map(([group, perms]) => (
                  <div key={group}>
                    <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                      {group}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {perms.map((perm) => (
                        <label
                          key={perm}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={createForm.permissions.includes(perm)}
                            onCheckedChange={() =>
                              togglePermissionInForm(createForm, setCreateForm, perm)
                            }
                          />
                          <span className="truncate">{perm}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {allPermissions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No permissions available. Please configure permissions on the server.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!createForm.name.trim()) {
                  toast({
                    title: "Role name required",
                    description: "Please provide a name for the role.",
                    variant: "destructive",
                  });
                  return;
                }
                createRoleMutation.mutate(createForm);
              }}
              disabled={createRoleMutation.isPending}
            >
              {createRoleMutation.isPending ? "Creating..." : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update the description and permissions for this role.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
            <div className="space-y-4 md:col-span-1">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input value={editForm.name} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role-description">Description</Label>
                <Input
                  id="edit-role-description"
                  placeholder="Short description of this role"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-4 md:col-span-2">
              <Label>Permissions</Label>
              <div className="border rounded-md p-3 max-h-[360px] overflow-y-auto space-y-3">
                {Object.entries(permissionsByGroup).map(([group, perms]) => (
                  <div key={group}>
                    <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                      {group}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {perms.map((perm) => (
                        <label
                          key={perm}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={editForm.permissions.includes(perm)}
                            onCheckedChange={() =>
                              togglePermissionInForm(editForm, setEditForm, perm)
                            }
                          />
                          <span className="truncate">{perm}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {allPermissions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No permissions available. Please configure permissions on the server.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editingRole) return;
                updateRoleMutation.mutate(editForm);
              }}
              disabled={updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

