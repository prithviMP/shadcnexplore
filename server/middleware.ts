import { Request, Response, NextFunction } from "express";
import { getUserFromSession } from "./auth";
import { hasPermission, hasAnyPermission, type Permission } from "./permissions";
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

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

/**
 * Middleware to require a specific permission
 * Usage: requirePermission("formulas:create")
 */
export function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!hasPermission(req.user.role, permission)) {
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
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!hasAnyPermission(req.user.role, permissions)) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "You don't have the required permissions" 
      });
    }

    next();
  };
}
