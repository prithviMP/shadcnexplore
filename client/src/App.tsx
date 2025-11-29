import { Switch, Route } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import AppSidebar from "@/components/AppSidebar";
import GlobalSearch from "@/components/GlobalSearch";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import SectorsList from "@/pages/SectorsList";
import SchedulerSettings from "@/pages/SchedulerSettings";
import SectorManager from "@/pages/SectorManager";
import CompanyManager from "@/pages/CompanyManager";
import CompanyDetail from "@/pages/CompanyDetail";
import FormulaManager from "@/pages/FormulaManager";
import FormulaBuilder from "@/pages/FormulaBuilder";
import QueryBuilder from "@/pages/QueryBuilder";
import UserManagement from "@/pages/UserManagement";
import Settings from "@/pages/Settings";
// import FinancialDataSpreadsheet from "@/pages/FinancialDataSpreadsheet";
// import CustomTables from "@/pages/CustomTables";

function AuthenticatedLayout() {
  const { user } = useAuth();
  const userRole = (user?.role as "admin" | "analyst" | "viewer") || "viewer";
  const userName = user?.name || "User";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar userRole={userRole} userName={userName} />
        <SidebarInset className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-b bg-background sticky top-0 z-40">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="shrink-0" />
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:block">
                <GlobalSearch />
              </div>
              <ThemeToggle />
            </div>
          </header>
          {/* Mobile search bar */}
          <div className="sm:hidden p-2 border-b bg-background">
            <GlobalSearch />
          </div>
          <main className="flex-1 overflow-auto p-3 sm:p-6 w-full min-w-0">
            <div className="max-w-auto mx-auto w-full min-w-0">
              <Switch>
                <Route path="/">
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                </Route>
                <Route path="/sectors">
                  <ProtectedRoute>
                    <SectorsList />
                  </ProtectedRoute>
                </Route>
                <Route path="/sectors/:sectorId">
                  <ProtectedRoute>
                    <SectorsList />
                  </ProtectedRoute>
                </Route>
                <Route path="/sector-manager">
                  <ProtectedRoute requiredRole="analyst">
                    <SectorManager />
                  </ProtectedRoute>
                </Route>
                <Route path="/company-manager">
                  <ProtectedRoute requiredRole="analyst">
                    <CompanyManager />
                  </ProtectedRoute>
                </Route>
                <Route path="/company/id/:id">
                  <ProtectedRoute>
                    <CompanyDetail />
                  </ProtectedRoute>
                </Route>
                <Route path="/company/:ticker">
                  <ProtectedRoute>
                    <CompanyDetail />
                  </ProtectedRoute>
                </Route>
                <Route path="/query-builder">
                  <ProtectedRoute requiredRole="analyst">
                    <QueryBuilder />
                  </ProtectedRoute>
                </Route>
                <Route path="/formulas">
                  <ProtectedRoute requiredRole="admin">
                    <FormulaManager />
                  </ProtectedRoute>
                </Route>
                <Route path="/formula-builder">
                  <ProtectedRoute requiredRole="analyst">
                    <FormulaBuilder />
                  </ProtectedRoute>
                </Route>
                <Route path="/users">
                  <ProtectedRoute requiredRole="admin">
                    <UserManagement />
                  </ProtectedRoute>
                </Route>
                {/* <Route path="/data-spreadsheet">
                  <ProtectedRoute requiredRole="analyst">
                    <FinancialDataSpreadsheet />
                  </ProtectedRoute>
                </Route>
            <Route path="/custom-tables">
              <ProtectedRoute requiredRole="analyst">
                <CustomTables />
              </ProtectedRoute>
            </Route> */}
                <Route path="/scheduler">
                  <ProtectedRoute requiredRole="admin">
                    <SchedulerSettings />
                  </ProtectedRoute>
                </Route>
                <Route path="/settings">
                  <ProtectedRoute requiredRole="analyst">
                    <Settings />
                  </ProtectedRoute>
                </Route>
                <Route path="/login">
                  <LoginPage />
                </Route>
                <Route component={NotFound} />
              </Switch>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
