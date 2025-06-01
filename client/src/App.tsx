import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/lib/store";
import { useEffect } from "react";
import AdminPage from "@/pages/admin";
import EmployeePage from "@/pages/employee";
import WorkLogDetailPage from "@/pages/work-log-detail";
import NotFound from "@/pages/not-found";
import {
  useCurrentAccount,
  ConnectButton,
  useDisconnectWallet,
} from "@mysten/dapp-kit";
import { ADMIN_ADDRESS } from "@/lib/constants";

function AppHeader() {
  const { isAdmin } = useAppStore();
  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

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
                {isAdmin ? "Admin Dashboard" : "Employee Portal"}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {currentAccount ? (
              <>
                <div className="web3-address glow-effect">
                  {currentAccount.address.substring(0, 6)}...
                  {currentAccount.address.substring(
                    currentAccount.address.length - 4
                  )}
                </div>
                <button
                  onClick={() => disconnect()}
                  className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <ConnectButton />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// Simple component to display when no wallet is connected
function ConnectWalletPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-full flex items-center justify-center mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        >
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h14v-4" />
          <path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2Z" />
        </svg>
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">
        Connect Your Wallet
      </h2>
      <p className="text-muted-foreground mb-6">
        Please connect your Sui wallet to access the Web3 CRM features.
      </p>
      {/* The ConnectButton in the AppHeader is the primary way to connect */}
      {/* Optionally, add another ConnectButton here if desired for more directness */}
      {/* <ConnectButton /> */}
    </div>
  );
}

function App() {
  // Get the action to set address and determine admin, and get isAdmin for routing
  const {
    setCurrentWalletAddressAndDetermineAdmin,
    isAdmin: currentIsAdminForRouting,
  } = useAppStore();
  const currentAccount = useCurrentAccount();

  useEffect(() => {
    // When wallet connection status changes, call the store action
    setCurrentWalletAddressAndDetermineAdmin(currentAccount?.address || null);
    // Log for debugging the effect trigger and values
    // console.log("App.tsx useEffect: currentAccount changed, address:", currentAccount?.address);
  }, [currentAccount?.address, setCurrentWalletAddressAndDetermineAdmin]);

  // Common layout structure
  const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-6 py-8">{children}</main>
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );

  if (!currentAccount) {
    // If no account is connected, show the connect prompt for all routes.
    return (
      <LayoutWrapper>
        <ConnectWalletPrompt />
      </LayoutWrapper>
    );
  }

  // If currentAccount exists, proceed with role-based routing
  return (
    <LayoutWrapper>
      <Switch>
        <Route path="/admin">
          {currentIsAdminForRouting ? (
            <AdminPage />
          ) : (
            <Redirect to="/employee" />
          )}
        </Route>
        <Route path="/admin/timesheet/:id">
          {(params) =>
            currentIsAdminForRouting ? (
              <WorkLogDetailPage timesheetId={params.id} />
            ) : (
              <Redirect to="/employee" />
            )
          }
        </Route>
        <Route path="/employee">
          {!currentIsAdminForRouting ? (
            <EmployeePage />
          ) : (
            <Redirect to="/admin" />
          )}
        </Route>
        <Route path="/">
          {currentIsAdminForRouting ? (
            <Redirect to="/admin" />
          ) : (
            <Redirect to="/employee" />
          )}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </LayoutWrapper>
  );
}

export default App;
