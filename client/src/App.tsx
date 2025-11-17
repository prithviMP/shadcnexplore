import { Switch, Route } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import AppSidebar from "@/components/AppSidebar";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import SectorsList from "@/pages/SectorsList";
import SectorManager from "@/pages/SectorManager";
import CompanyManager from "@/pages/CompanyManager";
import CompanyDetail from "@/pages/CompanyDetail";
import FormulaManager from "@/pages/FormulaManager";
import QueryBuilder from "@/pages/QueryBuilder";
import UserManagement from "@/pages/UserManagement";
import FinancialDataSpreadsheet from "@/pages/FinancialDataSpreadsheet";
import { useState } from "react";

function AuthenticatedLayout() {
  const [userRole] = useState<"admin" | "analyst" | "viewer">("admin");
  const [userName] = useState("Admin User");

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar userRole={userRole} userName={userName} />
        <SidebarInset className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/sectors" component={SectorsList} />
                <Route path="/sectors/:sector" component={SectorsList} />
                <Route path="/sector-manager" component={SectorManager} />
                <Route path="/company-manager" component={CompanyManager} />
                <Route path="/company/:ticker" component={CompanyDetail} />
                <Route path="/query-builder" component={QueryBuilder} />
                <Route path="/formulas" component={FormulaManager} />
                <Route path="/users" component={UserManagement} />
                <Route path="/data-spreadsheet" component={FinancialDataSpreadsheet} />
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
  const [isAuthenticated] = useState(true);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
