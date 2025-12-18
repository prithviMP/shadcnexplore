import { Request, Response, NextFunction } from "express";
import { getUserFromSession } from "./auth";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "./permissions";
import { storage } from "./storage";
import type { User } from "@shared/schema";

export interface AuthRequest extends Request {
  user?: User;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Try to get token from cookie first, then fall back to Authorization header
  const token = req.cookies?.auth_token || req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await getUserFromSession(token);
  
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Super admin bypasses role-based checks
    if (req.user.role === "super_admin") {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

async function hasPermissionForRole(role: string, permission: Permission): Promise<boolean> {
  // Super admin: always allowed
  if (role === "super_admin") {
    return true;
  }

  // Check database-backed role permissions first
  const dbRolePermissions = await storage.getRolePermissions(role);
  if (dbRolePermissions && Array.isArray(dbRolePermissions.permissions)) {
    if (dbRolePermissions.permissions.includes(permission)) {
      return true;
    }
  }

  // Fallback to default in-code permissions (for backward compatibility / safety)
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return defaultPermissions.includes(permission);
}

async function hasAnyPermissionForRole(role: string, permissions: Permission[]): Promise<boolean> {
  for (const permission of permissions) {
    if (await hasPermissionForRole(role, permission)) {
      return true;
    }
  }
  return false;
}

/**
 * Middleware to require a specific permission
 * Usage: requirePermission("formulas:create")
 */
export function requirePermission(permission: Permission) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const allowed = await hasPermissionForRole(req.user.role, permission);
    if (!allowed) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: `You don't have permission to ${permission}` 
      });
    }

    next();
  };
}

/**
 * Middleware to require any of the specified permissions
 * Usage: requireAnyPermission(["formulas:create", "formulas:update"])
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const allowed = await hasAnyPermissionForRole(req.user.role, permissions);
    if (!allowed) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "You don't have the required permissions" 
      });
    }

    next();
  };
}
