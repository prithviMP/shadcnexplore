/**
 * Role-Based Access Control (RBAC) Permissions
 * Defines permissions for each role in the system
 */

export type Permission =
  // Company & Sector Management
  | "companies:read"
  | "companies:create"
  | "companies:update"
  | "companies:delete"
  | "sectors:read"
  | "sectors:create"
  | "sectors:update"
  | "sectors:delete"
  // Formula Management
  | "formulas:read"
  | "formulas:create"
  | "formulas:update"
  | "formulas:delete"
  | "formulas:test"
  // Query Builder
  | "queries:read"
  | "queries:create"
  | "queries:update"
  | "queries:delete"
  | "queries:execute"
  // Data & Scraping
  | "data:read"
  | "data:export"
  | "scraper:trigger"
  | "scraper:view"
  // User Management
  | "users:read"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "users:manage_roles"
  // Custom Tables
  | "tables:read"
  | "tables:create"
  | "tables:update"
  | "tables:delete"
  // Dashboard & Reports
  | "dashboard:view"
  | "reports:view"
  | "reports:export";

export interface RolePermissions {
  role: string;
  permissions: Permission[];
}

/**
 * Default permissions for each role
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    // Full access to everything
    "companies:read",
    "companies:create",
    "companies:update",
    "companies:delete",
    "sectors:read",
    "sectors:create",
    "sectors:update",
    "sectors:delete",
    "formulas:read",
    "formulas:create",
    "formulas:update",
    "formulas:delete",
    "formulas:test",
    "queries:read",
    "queries:create",
    "queries:update",
    "queries:delete",
    "queries:execute",
    "data:read",
    "data:export",
    "scraper:trigger",
    "scraper:view",
    "users:read",
    "users:create",
    "users:update",
    "users:delete",
    "users:manage_roles",
    "tables:read",
    "tables:create",
    "tables:update",
    "tables:delete",
    "dashboard:view",
    "reports:view",
    "reports:export",
  ],
  analyst: [
    // Can read and create, but limited updates/deletes
    "companies:read",
    "companies:create",
    "companies:update",
    "sectors:read",
    "sectors:create",
    "sectors:update",
    "formulas:read",
    "formulas:test",
    "queries:read",
    "queries:create",
    "queries:update",
    "queries:execute",
    "data:read",
    "data:export",
    "scraper:view",
    "tables:read",
    "tables:create",
    "tables:update",
    "dashboard:view",
    "reports:view",
    "reports:export",
  ],
  viewer: [
    // Read-only access, can only see buy signals
    "companies:read",
    "sectors:read",
    "formulas:read",
    "queries:read",
    "data:read",
    "dashboard:view",
    "reports:view",
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

