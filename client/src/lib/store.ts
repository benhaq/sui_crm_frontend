import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ADMIN_ADDRESS } from "@/lib/constants"; // Import ADMIN_ADDRESS

// Define the structure for a timesheet as it will be stored in the app state
export interface AppTimesheet {
  id: string; // Whitelist object ID
  capId: string; // Cap object ID
  name: string;
  list: string[]; // List of employee addresses on this timesheet
}

interface AppState {
  isAdmin: boolean;
  // Removed setIsAdmin as its logic will be part of setCurrentWalletAddressAndDetermineAdmin

  currentWalletAddress: string | null;
  // Renamed setCurrentWalletAddress to be more descriptive of its new role
  setCurrentWalletAddressAndDetermineAdmin: (address: string | null) => void;

  currentAdminTab: "timesheet" | "worklog" | "pendingattachments";
  setCurrentAdminTab: (
    tab: "timesheet" | "worklog" | "pendingattachments"
  ) => void;

  currentEmployeeTab: "workrecord" | "salary";
  setCurrentEmployeeTab: (tab: "workrecord" | "salary") => void;

  isWeb3Connected: boolean; // This might become redundant if currentWalletAddress serves a similar purpose
  setWeb3Connected: (connected: boolean) => void;

  availableTimesheets: AppTimesheet[];
  setAvailableTimesheets: (timesheets: AppTimesheet[]) => void;

  selectedTimesheetForCheckin: AppTimesheet | null;
  setSelectedTimesheetForCheckin: (timesheet: AppTimesheet | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      isAdmin: false,

      currentWalletAddress: null,
      setCurrentWalletAddressAndDetermineAdmin: (address) => {
        const currentState = get();
        const newIsAdmin = address === ADMIN_ADDRESS;
        const newIsWeb3Connected = !!address;

        if (
          currentState.currentWalletAddress !== address ||
          currentState.isAdmin !== newIsAdmin ||
          currentState.isWeb3Connected !== newIsWeb3Connected
        ) {
          set({
            currentWalletAddress: address,
            isAdmin: newIsAdmin,
            isWeb3Connected: newIsWeb3Connected,
          });
          console.log(
            "Store: Address set to:",
            address,
            "isAdmin now:",
            newIsAdmin
          );
        } else {
          console.log(
            "Store: State unchanged, skipping update. Address:",
            address,
            "isAdmin:",
            newIsAdmin
          );
        }
      },

      currentAdminTab: "timesheet",
      setCurrentAdminTab: (tab) => set({ currentAdminTab: tab }),

      currentEmployeeTab: "workrecord",
      setCurrentEmployeeTab: (tab) => set({ currentEmployeeTab: tab }),

      isWeb3Connected: false,
      setWeb3Connected: (connected) => {
        if (get().isWeb3Connected !== connected) {
          set({ isWeb3Connected: connected });
        }
      },

      availableTimesheets: [],
      setAvailableTimesheets: (newTimesheets) => {
        const currentTimesheets = get().availableTimesheets;
        // Perform a simple deep comparison using JSON.stringify
        // This prevents unnecessary updates if the new data is structurally identical.
        if (
          JSON.stringify(currentTimesheets) !== JSON.stringify(newTimesheets)
        ) {
          set({ availableTimesheets: newTimesheets });
          console.log("Store: availableTimesheets updated.", newTimesheets);
        } else {
          console.log("Store: availableTimesheets unchanged, skipping update.");
        }
      },

      selectedTimesheetForCheckin: null,
      setSelectedTimesheetForCheckin: (timesheet) =>
        set({ selectedTimesheetForCheckin: timesheet }),
    }),
    {
      name: "app-storage",
    }
  )
);
