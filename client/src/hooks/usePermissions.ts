import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface RoleFromApi {
  id: string;
  name: string;
  permissions: string[];
}

export function useRolePermissions() {
  const { user } = useAuth();
  const roleName = user?.role;

  const { data, isLoading, error } = useQuery<RoleFromApi[]>({
    queryKey: ["/api/roles"],
    enabled: !!roleName,
  });

  const currentRole = data?.find((r) => r.name === roleName);

  return {
    permissions: currentRole?.permissions ?? [],
    loading: isLoading,
    error,
  };
}

export function useHasPermission(required: string | string[] | undefined) {
  const { user } = useAuth();
  const { permissions, loading } = useRolePermissions();

  // Super admin: always allowed
  if (user?.role === "super_admin") {
    return { allowed: true, loading: false };
  }

  if (!required) {
    return { allowed: true, loading };
  }

  const requiredList = Array.isArray(required) ? required : [required];
  const allowed = requiredList.some((perm) => permissions.includes(perm));

  return { allowed, loading };
}

