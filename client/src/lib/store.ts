import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  currentRole: 'admin' | 'employee';
  currentWalletAddress: string | null;
  currentAdminTab: 'timesheet' | 'worklog';
  currentEmployeeTab: 'workrecord' | 'salary';
  isWeb3Connected: boolean;
  setCurrentRole: (role: 'admin' | 'employee') => void;
  setCurrentWalletAddress: (address: string | null) => void;
  setCurrentAdminTab: (tab: 'timesheet' | 'worklog') => void;
  setCurrentEmployeeTab: (tab: 'workrecord' | 'salary') => void;
  setWeb3Connected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentRole: 'admin',
      currentWalletAddress: null,
      currentAdminTab: 'timesheet',
      currentEmployeeTab: 'workrecord',
      isWeb3Connected: false,
      setCurrentRole: (role) => set({ currentRole: role }),
      setCurrentWalletAddress: (address) => set({ currentWalletAddress: address }),
      setCurrentAdminTab: (tab) => set({ currentAdminTab: tab }),
      setCurrentEmployeeTab: (tab) => set({ currentEmployeeTab: tab }),
      setWeb3Connected: (connected) => set({ isWeb3Connected: connected }),
    }),
    {
      name: 'web3-crm-store',
    }
  )
);
