import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleSwitcher } from "@/components/role-switcher";
import { useAppStore } from "@/lib/store";
import { useWeb3 } from "@/hooks/use-web3";
import { useEffect } from "react";
import AdminPage from "@/pages/admin";
import EmployeePage from "@/pages/employee";
import WorkLogDetailPage from "@/pages/work-log-detail";
import NotFound from "@/pages/not-found";

function AppHeader() {
  const { currentRole, currentWalletAddress, isWeb3Connected } = useAppStore();
  const { connectWallet, isConnecting } = useWeb3();

  return (
    <header className="bg-background/95 backdrop-blur-xl border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">W3</span>
              </div>
              <div>
                <div className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  Web3 CRM
                </div>
                <div className="text-xs text-muted-foreground">
                  Decentralized Workforce Management
                </div>
              </div>
            </div>
            <div className="h-6 w-px bg-border/50"></div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-sm text-muted-foreground">
                {currentRole === 'admin' ? 'Admin Dashboard' : 'Employee Portal'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {isWeb3Connected && currentWalletAddress ? (
              <div className="web3-address glow-effect">
                {currentWalletAddress.substring(0, 6)}...{currentWalletAddress.substring(-4)}
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="px-4 py-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white rounded-lg transition-all duration-200 disabled:opacity-50 font-medium text-sm glow-effect"
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
            <RoleSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}

function Router() {
  const { currentRole } = useAppStore();

  return (
    <Switch>
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/timesheet/:id" component={WorkLogDetailPage} />
      <Route path="/employee" component={EmployeePage} />
      <Route path="/">
        {currentRole === 'admin' ? <AdminPage /> : <EmployeePage />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { setWeb3Connected } = useAppStore();

  useEffect(() => {
    // Check for Web3 support on app load
    if (typeof window !== 'undefined' && window.ethereum) {
      setWeb3Connected(true);
    }
  }, [setWeb3Connected]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <AppHeader />
          <main className="pb-8">
            <Router />
          </main>
          <div className="fixed inset-0 pointer-events-none">
            <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
