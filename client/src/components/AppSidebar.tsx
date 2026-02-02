import { LayoutDashboard, Building2, Table, Search, Users, Settings, Building, Briefcase, LogOut, Clock, Sliders, Shield } from "lucide-react";
import Logo from "@/components/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions } from "@/hooks/usePermissions";

type UserRole = string; // Display only; visibility is permission-based

interface AppSidebarProps {
  userRole?: UserRole;
  userName?: string;
}

export default function AppSidebar({ userRole = "admin", userName = "Admin User" }: AppSidebarProps) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { permissions } = useRolePermissions();

  // Super admin has access to everything
  const isSuperAdmin = user?.role === "super_admin";

  const canViewSectors = isSuperAdmin || permissions.includes("sectors:read") || permissions.includes("companies:read");
  const canManageSectors = isSuperAdmin || permissions.includes("sectors:create") || permissions.includes("sectors:update");
  const canManageCompanies = isSuperAdmin || permissions.includes("companies:create") || permissions.includes("companies:update");
  const canViewScheduler = isSuperAdmin || permissions.includes("scraper:view") || permissions.includes("scraper:update") || permissions.includes("scraper:read");
  const canUseQueryBuilder = isSuperAdmin || permissions.includes("queries:read");
  const canManageFormulas = isSuperAdmin || permissions.includes("formulas:read");
  const canViewSettings = isSuperAdmin || permissions.includes("settings:read");
  const canManageUsers = isSuperAdmin || permissions.includes("users:read");
  const canManageRoles = isSuperAdmin || permissions.includes("users:manage_roles");

  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, visible: true },
    { title: "Sectors", url: "/sectors", icon: Building2, visible: canViewSectors },
    { title: "Sector Manager", url: "/sector-manager", icon: Building, visible: canManageSectors },
    { title: "Company Manager", url: "/company-manager", icon: Briefcase, visible: canManageCompanies },
    // { title: "Data Spreadsheet", url: "/data-spreadsheet", icon: Table, visible: canManageCompanies },
    // { title: "Custom Tables", url: "/custom-tables", icon: Table, visible: canManageCompanies },
    { title: "Scheduler", url: "/scheduler", icon: Clock, visible: canViewScheduler },
    { title: "Query Builder", url: "/query-builder", icon: Search, visible: canUseQueryBuilder },
    { title: "Formulas", url: "/formulas", icon: Settings, visible: canManageFormulas },
    { title: "Settings", url: "/settings", icon: Sliders, visible: canViewSettings },
    { title: "Users", url: "/users", icon: Users, visible: canManageUsers },
    { title: "Roles", url: "/roles", icon: Shield, visible: canManageRoles },
  ];

  const visibleItems = navItems.filter(item => item.visible);
  const initials = userName.split(" ").map(n => n[0]).join("");

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Logo size="md" className="rounded-md" />
          <div>
            <h2 className="font-semibold text-sm">myBiniyog Valora</h2>
            <p className="text-xs text-muted-foreground">Financial Screener</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t space-y-2">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
