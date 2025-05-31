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
    <header className="bg-slate-900 text-white border-b border-slate-800">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-xl font-semibold">Web3 CRM</div>
            <div className="text-sm opacity-75">
              {currentRole === 'admin' ? 'Admin Dashboard' : 'Employee Portal'}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {isWeb3Connected && currentWalletAddress ? (
              <div className="text-sm font-mono bg-white/10 px-3 py-1 rounded">
                {currentWalletAddress.substring(0, 6)}...{currentWalletAddress.substring(-4)}
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition-colors disabled:opacity-50"
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
        <div className="min-h-screen bg-gray-50">
          <AppHeader />
          <main className="pb-8">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
