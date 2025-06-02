import { useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddEmployeeModal } from "@/components/add-employee-modal";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import { Clock, Paperclip } from "lucide-react";
import type { WorkRecord } from "@shared/schema"; // Timesheet from @shared/schema might conflict or not be what we need for Sui display

// Sui imports
import {
  useSuiClient,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
} from "@mysten/dapp-kit"; // Added types
import { Transaction } from "@mysten/sui/transactions"; // Corrected: Changed from TransactionBlock
import { useNetworkVariable } from "@/networkConfig"; // Corrected import name
import type { AppTimesheet } from "@/lib/store"; // Import the AppTimesheet type
import { set as idbSet, get as idbGet, del as idbDel } from "idb-keyval"; // Using idb-keyval again
import {
  SealClient,
  SessionKey,
  getAllowlistedKeyServers,
  NoAccessError,
  EncryptedObject,
} from "@mysten/seal"; // Added Seal imports
import { SuiGraphQLClient } from "@mysten/sui/graphql"; // Added for SessionKey client
import { CreateTimesheetSuiForm } from "@/components/admin/CreateTimesheetSuiForm"; // Reverted: Import the new form component
import { ActiveTimesheetsList } from "@/components/admin/ActiveTimesheetsList"; // Import the new list component
import { PendingAttachments } from "@/components/admin/PendingAttachments"; // Import the new attachments component
import { WALRUS_SERVICES } from "@/services/walrusService"; // For Walrus URLs

// Define a new type for Sui-based timesheets (Whitelists)
interface SuiTimesheet {
  id: string; // Object ID of the Whitelist
  capId: string; // Object ID of the WhiteListCap
  name: string; // Name of the whitelist (e.g., "WorklogMay2025")
  list: string[]; // List of addresses on the whitelist (employees)
}

interface FetchedSuiTimesheet {
  // This is the type expected by the useQuery
  id: string;
  capId: string;
  name: string;
  list: string[];
}

interface CreateTimesheetForm {
  name: string;
}

// Interface for the pending log marker data
interface PendingLogMarker {
  id: string; // Ensure this is created when loading/saving
  blobId: string;
  sealLogId: string;
  timesheetId: string;
  timesheetCapId: string;
  employeeAddress: string;
  originalWorkLogData: any;
  timestamp: number;
  status: string; // e.g., 'pendingAdminAttachment' (managed by admin side now)
}

const ADMIN_LOG_MARKERS_DB_KEY = "admin-pending-log-markers"; // Key for admin's local list

// Structure for fetched on-chain log markers
interface OnChainLogMarker {
  blobId: string; // Dynamic field name
  sealLogId: string; // Dynamic field value (assuming it's the hex string of the unique part of Seal ID)
  // Potentially other data if the dynamic field value is a struct, fetched via getObject
}

export default function AdminPage() {
  const [createForm, setCreateForm] = useState<CreateTimesheetForm>({
    name: "",
  });
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<string | null>(
    null
  );
  const [selectedCapId, setSelectedCapId] = useState<string | null>(null);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [isCreatingTimesheet, setIsCreatingTimesheet] = useState(false);
  const [isProcessingAttachment, setIsProcessingAttachment] = useState<
    string | null
  >(null); // blobId of processing item
  const [pendingMarkersInput, setPendingMarkersInput] = useState(""); // For the textarea
  const [pendingLogMarkers, setPendingLogMarkers] = useState<
    PendingLogMarker[]
  >([]); // Loaded from admin's IDB

  const { currentAdminTab, setCurrentAdminTab, setAvailableTimesheets } =
    useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Sui hooks
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransactionMutation } =
    useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage(); // Get signPersonalMessage hook
  const packageId = useNetworkVariable("packageId");
  const timesheetsQueryKey: QueryKey = [
    "sui",
    "whitelists_and_caps",
    currentAccount?.address,
    packageId,
  ];

  // Placeholder for KEY_SERVER_OBJECT_IDS_TESTNET and ENCRYPTION_THRESHOLD if not globally defined
  // These should ideally come from a shared config or constants file
  const KEY_SERVER_OBJECT_IDS_TESTNET = getAllowlistedKeyServers("testnet");

  const queryFn = async (): Promise<FetchedSuiTimesheet[]> => {
    if (!currentAccount?.address || !packageId) {
      console.log(
        "AdminPage QueryFn: Aborting fetch - no currentAccount or packageId",
        { addr: currentAccount?.address, pkg: packageId }
      );
      return Promise.resolve([]);
    }
    console.log(
      `AdminPage QueryFn: START - Fetching for account: ${currentAccount.address}, package: ${packageId}`
    );
    try {
      console.log("AdminPage QueryFn: 1. Fetching owned Cap objects...");
      const ownedCapsResponse = await suiClient.getOwnedObjects({
        owner: currentAccount.address,
        filter: { StructType: `${packageId}::whitelist::Cap` },
        options: { showContent: true, showType: true, showOwner: true },
      });
      console.log(
        "AdminPage QueryFn: Raw ownedCapsResponse data:",
        ownedCapsResponse.data
      );
      const capsData = ownedCapsResponse.data
        .map((capObj) => {
          const fields = (capObj.data?.content as any)?.fields;
          if (capObj.data?.objectId && fields?.allowlist_id) {
            return {
              capId: capObj.data.objectId,
              allowlistId: fields.allowlist_id as string,
            };
          }
          return null;
        })
        .filter((c): c is { capId: string; allowlistId: string } => !!c);
      console.log("AdminPage QueryFn: Processed capsData:", capsData);
      if (capsData.length === 0) {
        console.log("AdminPage QueryFn: No caps found, returning empty array.");
        return Promise.resolve([]);
      }
      const allowlistIds = capsData.map((c) => c.allowlistId);
      console.log(
        "AdminPage QueryFn: 2. Fetching Whitelist objects for IDs:",
        allowlistIds
      );
      const whitelistObjectsResponse = await suiClient.multiGetObjects({
        ids: allowlistIds,
        options: { showContent: true, showType: true },
      });
      console.log(
        "AdminPage QueryFn: Raw whitelistObjectsResponse data:",
        whitelistObjectsResponse.map((r) => r.data)
      );
      const fetchedTimesheetsResult: FetchedSuiTimesheet[] =
        whitelistObjectsResponse
          .map((whitelistObj) => {
            const objectId = whitelistObj.data?.objectId;
            const content = (whitelistObj.data?.content as any)?.fields;
            const name = content?.name as string;
            const list = (content?.list as string[]) || [];
            console.log(
              `AdminPage QueryFn:   Whitelist Name: ${name}, ID: ${objectId}, Raw list from content:`,
              list
            );
            const correspondingCap = capsData.find(
              (c) => c.allowlistId === objectId
            );
            if (objectId && name && correspondingCap) {
              return {
                id: objectId,
                capId: correspondingCap.capId,
                name: name,
                list: list,
              };
            }
            console.warn(
              `AdminPage QueryFn: Could not fully process whitelist object or find its cap. Object ID: ${objectId}, Name: ${name}, Cap Found: ${!!correspondingCap}`
            );
            return null;
          })
          .filter((ts): ts is FetchedSuiTimesheet => ts !== null);
      console.log(
        "AdminPage QueryFn: END - Final fetchedTimesheetsResult:",
        fetchedTimesheetsResult
      );
      return Promise.resolve(fetchedTimesheetsResult);
    } catch (error) {
      console.error(
        "AdminPage QueryFn: CATCH - Error fetching Sui timesheets and caps:",
        error
      );
      toast({
        title: "Error Fetching Timesheets Data",
        description:
          error instanceof Error
            ? error.message
            : "Could not load timesheets from Sui.",
        variant: "destructive",
      });
      return Promise.reject(error);
    }
  };

  const { data: timesheetsData, isLoading: timesheetsLoading } = useQuery<
    FetchedSuiTimesheet[],
    Error,
    FetchedSuiTimesheet[],
    QueryKey
  >({
    queryKey: timesheetsQueryKey,
    queryFn: queryFn,
    enabled: !!currentAccount?.address && !!packageId,
    refetchInterval: 10000,
    initialData: [],
  });

  // Use timesheetsData directly as it's guaranteed to be an array by initialData
  const timesheets: FetchedSuiTimesheet[] = timesheetsData;

  // Effect to update Zustand store when timesheets data changes
  useEffect(() => {
    if (timesheets && timesheets.length > 0) {
      const appTimesheets: AppTimesheet[] = timesheets.map((ts) => ({
        id: ts.id,
        capId: ts.capId,
        name: ts.name,
        list: ts.list, // This is the critical field
      }));
      console.log(
        "AdminPage useEffect: Setting availableTimesheets in store with data:",
        appTimesheets
      );
      setAvailableTimesheets(appTimesheets);
    } else if (!timesheetsLoading && timesheets.length === 0) {
      console.log(
        "AdminPage useEffect: No timesheets loaded or timesheets array is empty. Clearing store."
      );
      setAvailableTimesheets([]);
    }
    // Optional: Log when timesheets data itself is undefined/null during loading phases
    // else if (timesheetsLoading) {
    //   console.log("AdminPage useEffect: Timesheets are currently loading...");
    // }
  }, [timesheets, timesheetsLoading, setAvailableTimesheets]);

  const createTimesheetMutation = useMutation({
    mutationFn: async (formData: CreateTimesheetForm) => {
      if (!currentAccount || !packageId) {
        throw new Error("Wallet not connected or packageId not found.");
      }
      if (!formData.name.trim()) {
        throw new Error("Project name cannot be empty.");
      }
      setIsCreatingTimesheet(true);
      const txb = new Transaction();
      txb.moveCall({
        target: `${packageId}::whitelist::create_allowlist_entry`,
        arguments: [txb.pure.string(formData.name)],
      });
      return signAndExecuteTransactionMutation({
        transaction: txb,
      });
    },
    onSuccess: (result: any, variables: CreateTimesheetForm) => {
      console.log("Create Timesheet tx successful. Digest:", result.digest);
      toast({
        title: "Timesheet Creation Submitted",
        description: `Digest: ${result.digest.substring(0, 10)}...`,
      });
      setCreateForm({ name: "" });

      // Using the specific query key for invalidation
      console.log(
        "Invalidating timesheets query with key:",
        timesheetsQueryKey
      );
      queryClient.invalidateQueries({ queryKey: timesheetsQueryKey });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Creating Timesheet",
        description: error.message || "Failed to submit transaction to Sui.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsCreatingTimesheet(false);
    },
  });

  const handleCreateTimesheet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Project Name is required.",
        variant: "destructive",
      });
      return;
    }
    createTimesheetMutation.mutate(createForm);
  };

  const handleAddEmployee = (timesheetId: string, capId: string) => {
    setSelectedTimesheetId(timesheetId);
    setSelectedCapId(capId);
    setShowAddEmployeeModal(true);
  };

  const handleViewWorkLog = (timesheetId: string) => {
    setLocation(`/timesheet/${timesheetId}`);
  };

  // EmployeeWorkSummary logic remains as it's based on allWorkRecords, which is a separate query for now.
  // This part might need integration with on-chain data if employees are managed on-chain per timesheet.
  const { data: allWorkRecords = [] } = useQuery<WorkRecord[]>({
    queryKey: ["/api/work-records"],
    initialData: [], // Provide initialData
  });

  const employeeWorkSummary = allWorkRecords.reduce((acc, record) => {
    if (!acc[record.employeeAddress]) {
      acc[record.employeeAddress] = {
        address: record.employeeAddress,
        totalHours: 0,
        checkinsToday: 0,
        lastActivity: record.checkIn,
        records: [],
      };
    }
    acc[record.employeeAddress].records.push(record);
    if (record.totalHours) {
      acc[record.employeeAddress].totalHours += parseFloat(record.totalHours);
    }
    const today = new Date().toISOString().split("T")[0];
    const recordDate = new Date(record.checkIn).toISOString().split("T")[0];
    if (recordDate === today) {
      acc[record.employeeAddress].checkinsToday++;
    }
    return acc;
  }, {} as Record<string, any>);

  // Load pending markers from Admin's IndexedDB on mount
  useEffect(() => {
    const loadMarkers = async () => {
      const loaded = await idbGet<PendingLogMarker[]>(ADMIN_LOG_MARKERS_DB_KEY);
      if (loaded) {
        // Ensure each marker has an 'id' for React key and processing logic
        setPendingLogMarkers(
          loaded.map((m) => ({
            ...m,
            id: m.id || `${m.timesheetId}-${m.blobId}`,
          }))
        );
      }
    };
    loadMarkers();
  }, []);

  const processAndAddMarkersFromString = async (markerJsonString: string) => {
    if (!markerJsonString.trim()) {
      toast({
        title: "Input Empty",
        description: "No marker data provided to process.",
        variant: "destructive",
      });
      return;
    }
    try {
      let parsedData = JSON.parse(markerJsonString);
      if (!Array.isArray(parsedData)) {
        parsedData = [parsedData];
      }

      const newMarkers: PendingLogMarker[] = parsedData.map(
        (item: any, index: number) => ({
          blobId: item.blobId,
          sealLogId: item.sealLogId,
          timesheetId: item.timesheetId,
          timesheetCapId: item.timesheetCapId,
          employeeAddress: item.employeeAddress,
          originalWorkLogData: item.originalWorkLogData,
          timestamp: item.timestamp || Date.now(),
          status: item.status || "pendingAdminAttachment",
          id:
            item.id ||
            `${item.timesheetId}-${item.blobId}-${Date.now()}-${index}`,
        })
      );

      for (const marker of newMarkers) {
        if (
          !marker.blobId ||
          !marker.timesheetId ||
          !marker.timesheetCapId ||
          !marker.employeeAddress
        ) {
          toast({
            title: "Invalid Data",
            description: `Marker missing essential fields (blobId, timesheetId, timesheetCapId, employeeAddress). Problematic item: ${JSON.stringify(
              marker
            )}`,
            variant: "destructive",
            duration: 7000,
          });
          return; // Stop processing if any marker is invalid
        }
      }

      const currentMarkers =
        (await idbGet<PendingLogMarker[]>(ADMIN_LOG_MARKERS_DB_KEY)) || [];
      const combinedMarkers = [...currentMarkers];
      let addedCount = 0;
      newMarkers.forEach((nm) => {
        if (!combinedMarkers.some((cm) => cm.id === nm.id)) {
          combinedMarkers.push(nm);
          addedCount++;
        } else {
          console.log(
            `Marker with ID ${nm.id} already exists in admin's list. Skipping.`
          );
        }
      });

      if (addedCount > 0) {
        await idbSet(ADMIN_LOG_MARKERS_DB_KEY, combinedMarkers);
        setPendingLogMarkers(
          combinedMarkers.map((m) => ({
            ...m,
            id: m.id || `${m.timesheetId}-${m.blobId}`,
          }))
        );
        toast({
          title: "Markers Processed",
          description: `${addedCount} new marker(s) added to your local pending list.`,
        });
      } else {
        toast({
          title: "No New Markers",
          description: "The provided marker(s) are already in your list.",
        });
      }
    } catch (e) {
      toast({
        title: "Parse Error",
        description: "Invalid JSON data provided.",
        variant: "destructive",
      });
      console.error("Error parsing marker data:", e);
    }
  };

  const handleLoadAndSavePastedMarkers = async () => {
    await processAndAddMarkersFromString(pendingMarkersInput);
    setPendingMarkersInput(""); // Clear textarea after processing
  };

  const handleLoadAndProcessLatestFromStorage = async () => {
    const latestMarkerString = localStorage.getItem(
      "latestPendingLogMarkerForAdmin"
    );
    if (latestMarkerString) {
      await processAndAddMarkersFromString(latestMarkerString);
      // Optional: Clear the local storage item after successful processing
      // localStorage.removeItem('latestPendingLogMarkerForAdmin');
      // toast({ title: "Processed from Storage", description: "Latest marker processed and removed from browser storage." });
    } else {
      toast({
        title: "Not Found",
        description:
          "No 'latestPendingLogMarkerForAdmin' found in local storage.",
        variant: "destructive",
      });
    }
  };

  const attachLogMarkerMutation = useMutation({
    mutationFn: async (marker: PendingLogMarker) => {
      if (!currentAccount || !packageId)
        throw new Error("Admin wallet not connected or packageId missing.");
      if (!marker.timesheetCapId)
        throw new Error("Timesheet Cap ID is missing for this marker.");
      if (!marker.sealLogId)
        throw new Error(
          "Seal Log ID is missing for this marker and is required for on-chain storage and decryption."
        );

      setIsProcessingAttachment(marker.id!);
      const txb = new Transaction();
      txb.moveCall({
        target: `${packageId}::whitelist::add_log_marker`,
        arguments: [
          txb.object(marker.timesheetId),
          txb.object(marker.timesheetCapId),
          txb.pure.string(marker.blobId),
        ],
      });
      const submissionResult = await signAndExecuteTransactionMutation({
        transaction: txb,
      });
      if (!submissionResult.digest)
        throw new Error("Transaction submission failed, no digest returned.");
      await suiClient.waitForTransaction({ digest: submissionResult.digest });
      return suiClient.getTransactionBlock({
        digest: submissionResult.digest,
        options: { showEffects: true },
      });
    },
    onSuccess: async (result, variables_marker) => {
      if (result.effects?.status.status === "success") {
        toast({
          title: "Log Marker Attached!",
          description: `Successfully attached log for blob: ${variables_marker.blobId.substring(
            0,
            6
          )}...`,
        });
        const updatedMarkers = pendingLogMarkers.filter(
          (m) => m.id !== variables_marker.id
        );
        await idbSet(ADMIN_LOG_MARKERS_DB_KEY, updatedMarkers); // Update admin's IndexedDB
        setPendingLogMarkers(updatedMarkers);

        // Check if the processed marker was the one in localStorage
        const latestMarkerString = localStorage.getItem(
          "latestPendingLogMarkerForAdmin"
        );
        if (latestMarkerString) {
          try {
            const parsedLocalStorageMarker = JSON.parse(latestMarkerString);
            // Compare key fields to see if it matches the one just processed
            if (
              parsedLocalStorageMarker.blobId === variables_marker.blobId &&
              parsedLocalStorageMarker.timesheetId ===
                variables_marker.timesheetId &&
              parsedLocalStorageMarker.sealLogId === variables_marker.sealLogId // Ensure sealLogId is also compared
            ) {
              localStorage.removeItem("latestPendingLogMarkerForAdmin");
              toast({
                title: "Local Cache Cleared",
                description:
                  "Successfully processed marker was removed from browser's local cache.",
                duration: 3000,
              });
            }
          } catch (e) {
            console.warn(
              "Could not parse or compare localStorage marker for cleanup:",
              e
            );
          }
        }
      } else {
        throw new Error(`Transaction failed: ${result.effects?.status.error}`);
      }
    },
    onError: (error: Error, variables_marker) => {
      toast({
        title: "Attachment Failed",
        description: `For blob ${variables_marker.blobId.substring(0, 6)}...: ${
          error.message
        }`,
        variant: "destructive",
      });
      console.error("Error attaching log marker:", error);
    },
    onSettled: () => {
      setIsProcessingAttachment(null);
    },
  });

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Manage timesheets and employee work records
        </p>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <Tabs
            value={currentAdminTab}
            onValueChange={(value) =>
              setCurrentAdminTab(value as "timesheet" | "pendingattachments")
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="timesheet"
                className="flex items-center space-x-2"
              >
                <Clock className="h-4 w-4" />
                <span>Manage Timesheet</span>
              </TabsTrigger>
              <TabsTrigger
                value="pendingattachments"
                className="flex items-center space-x-2"
              >
                <Paperclip className="h-4 w-4" />
                <span>Pending Attachments</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timesheet" className="mt-6">
              <CreateTimesheetSuiForm
                createForm={createForm}
                setCreateForm={setCreateForm}
                handleCreateTimesheet={handleCreateTimesheet}
                isCreatingTimesheet={isCreatingTimesheet}
                isMutationPending={createTimesheetMutation.isPending}
                canSubmit={!!currentAccount && !!packageId}
                packageId={packageId}
              />

              {/* Active Timesheets List Component */}
              <ActiveTimesheetsList
                timesheets={timesheets} // timesheetsData is already FetchedSuiTimesheet[]
                isLoading={timesheetsLoading}
                onAddEmployee={handleAddEmployee}
                onViewWorkLog={handleViewWorkLog}
              />
            </TabsContent>

            <TabsContent value="pendingattachments" className="mt-6">
              <PendingAttachments
                pendingMarkersInput={pendingMarkersInput}
                setPendingMarkersInput={setPendingMarkersInput}
                handleLoadAndSavePastedMarkers={handleLoadAndSavePastedMarkers}
                handleLoadAndProcessLatestFromStorage={
                  handleLoadAndProcessLatestFromStorage
                }
                pendingLogMarkers={pendingLogMarkers}
                attachLogMarkerMutationPending={
                  attachLogMarkerMutation.isPending
                }
                isProcessingAttachmentId={isProcessingAttachment}
                onAttachLogMarker={(marker) =>
                  attachLogMarkerMutation.mutate(marker)
                }
                isAdminWalletConnected={!!currentAccount?.address}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AddEmployeeModal
        isOpen={showAddEmployeeModal}
        onClose={() => {
          setShowAddEmployeeModal(false);
          setSelectedTimesheetId(null);
          setSelectedCapId(null);
        }}
        timesheetId={selectedTimesheetId}
        capId={selectedCapId}
      />
    </div>
  );
}

// Removed conflicting local WorkRecord type
