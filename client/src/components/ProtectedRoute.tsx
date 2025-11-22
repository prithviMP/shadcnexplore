import { ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "analyst" | "viewer";
  requiredPermission?: string;
}

export default function ProtectedRoute({
  children,
  requiredRole,
  requiredPermission,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!user) {
    return <LoginPage />;
  }

  // Check role requirement
  if (requiredRole) {
    const roleHierarchy: Record<string, number> = {
      viewer: 1,
      analyst: 2,
      admin: 3,
    };

    const userRoleLevel = roleHierarchy[user.role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-4">
              You don't have permission to access this page.
            </p>
            <button
              onClick={() => setLocation("/")}
              className="text-primary hover:underline"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }
  }

  // TODO: Check permission requirement when permission system is implemented
  // if (requiredPermission && !hasPermission(user, requiredPermission)) {
  //   return <AccessDenied />;
  // }

  return <>{children}</>;
}

