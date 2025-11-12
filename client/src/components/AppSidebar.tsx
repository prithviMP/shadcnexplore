import { LayoutDashboard, Building2, TrendingUp, Table, Search, Users, Settings } from "lucide-react";
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
import { Link, useLocation } from "wouter";

type UserRole = "admin" | "analyst" | "viewer";

interface AppSidebarProps {
  userRole?: UserRole;
  userName?: string;
}

export default function AppSidebar({ userRole = "admin", userName = "Admin User" }: AppSidebarProps) {
  const [location] = useLocation();

  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "analyst", "viewer"] },
    { title: "Sectors", url: "/sectors", icon: Building2, roles: ["admin", "analyst", "viewer"] },
    { title: "Signals", url: "/signals", icon: TrendingUp, roles: ["admin", "analyst", "viewer"] },
    { title: "Query Builder", url: "/query-builder", icon: Search, roles: ["admin", "analyst"] },
    { title: "Custom Tables", url: "/tables", icon: Table, roles: ["admin", "analyst"] },
    { title: "Formulas", url: "/formulas", icon: Settings, roles: ["admin"] },
    { title: "Users", url: "/users", icon: Users, roles: ["admin"] },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(userRole));
  const initials = userName.split(" ").map(n => n[0]).join("");

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">FinAnalytics</h2>
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
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
