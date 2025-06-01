import { useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddEmployeeModal } from "@/components/add-employee-modal";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import {
  Loader2,
  Plus,
  Clock,
  Users,
  Eye,
  BarChart3,
  ListChecks,
  Paperclip,
  ClipboardPaste,
  KeyRound,
} from "lucide-react";
import type { /*Timesheet,*/ WorkRecord } from "@shared/schema"; // Timesheet from @shared/schema might conflict or not be what we need for Sui display

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
import { fromHex, toHEX } from "@/lib/suiUtils"; // Re-added fromHex, added toHEX for consistency
import {
  SealClient,
  SessionKey,
  getAllowlistedKeyServers,
  NoAccessError,
  EncryptedObject,
} from "@mysten/seal"; // Added Seal imports
import { SuiGraphQLClient } from "@mysten/sui/graphql"; // Added for SessionKey client
import { AdminSealSetup } from "@/components/admin/AdminSealSetup"; // Import the new component
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

  // Admin Seal Client and Session Key state
  const [sealClientForAdmin, setSealClientForAdmin] =
    useState<SealClient | null>(null);
  const [sessionKeyForAdmin, setSessionKeyForAdmin] =
    useState<SessionKey | null>(null);
  const [isInitializingSealAdmin, setIsInitializingSealAdmin] = useState(false);
  const [adminSealError, setAdminSealError] = useState<string | null>(null);

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
  // const ENCRYPTION_THRESHOLD = 1; // Already defined in employee.tsx, ensure consistency if needed here

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
    const selected = timesheets.find((ts) => ts.id === timesheetId);
    if (selected) {
      setSelectedTimesheetId(timesheetId);
      setCurrentAdminTab("worklog"); // Switch to worklog tab
    }
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

  const initializeAdminSealSession = async () => {
    if (!currentAccount?.address || !packageId || !suiClient) {
      setAdminSealError(
        "Wallet not connected, packageId missing, or Sui client not available."
      );
      console.error("AdminSeal: Pre-flight check failed", {
        currentAccount,
        packageId,
        suiClient,
      });
      return;
    }
    console.log("AdminSeal: Starting initialization...");
    setIsInitializingSealAdmin(true);
    setAdminSealError(null);
    try {
      console.log("AdminSeal: Initializing Seal Client...");
      const client = new SealClient({
        suiClient: suiClient as any, // Cast if direct type compatibility issues
        serverObjectIds: KEY_SERVER_OBJECT_IDS_TESTNET.map((id) => [id, 1]), // Example threshold 1
        verifyKeyServers: false, // Set as per your security model
      });
      setSealClientForAdmin(client);
      console.log("AdminSeal: Seal Client initialized.");

      const sessionKeyIdbKey = `seal-session-key-admin-${currentAccount.address}-${packageId}`;
      const storedSessionData = await idbGet(sessionKeyIdbKey);

      let sk: SessionKey | undefined;

      if (
        storedSessionData &&
        storedSessionData.exportedKey &&
        storedSessionData.signature
      ) {
        console.log(
          "AdminSeal: Found existing session key in IndexedDB, importing..."
        );
        const importedSk = await SessionKey.import(
          storedSessionData.exportedKey,
          new SuiGraphQLClient({
            url: "https://sui-testnet.mystenlabs.com/graphql",
          }) as any
        );
        if (!importedSk.isExpired()) {
          importedSk.setPersonalMessageSignature(storedSessionData.signature);
          sk = importedSk;
          console.log(
            "AdminSeal: SessionKey imported and signature re-applied successfully."
          );
        } else {
          console.log(
            "AdminSeal: Stored session key expired, creating new one."
          );
          await idbDel(sessionKeyIdbKey);
        }
      }

      if (!sk) {
        console.log("AdminSeal: Creating new SessionKey...");
        sk = new SessionKey({
          address: currentAccount.address,
          packageId: packageId,
          ttlMin: 30, // Admin session key can last longer, e.g., 24 hours
          client: new SuiGraphQLClient({
            url: "https://sui-testnet.mystenlabs.com/graphql",
          }) as any,
        });
        const personalMessage = sk.getPersonalMessage();
        toast({
          title: "Admin Seal Setup",
          description:
            "Please sign the message in your wallet to activate Seal session key.",
          duration: 7000,
        });
        console.log(
          "AdminSeal: Signing personal message for SessionKey...",
          toHEX(personalMessage)
        );

        // User interaction point:
        const { signature: signedPersonalMessage } =
          await signPersonalMessageAsync({ message: personalMessage });
        console.log("AdminSeal: Personal message signed successfully.");

        sk.setPersonalMessageSignature(signedPersonalMessage);
        console.log("AdminSeal: New SessionKey initialized and signed.");
        await idbSet(sessionKeyIdbKey, {
          exportedKey: sk.export(),
          signature: signedPersonalMessage,
        });
        console.log("AdminSeal: New SessionKey and signature stored.");
      }
      setSessionKeyForAdmin(sk);
      toast({
        title: "Admin Seal Ready",
        description: "Seal client and session key initialized for admin.",
        variant: "default",
      });
      console.log("AdminSeal: Initialization complete.");
    } catch (error: any) {
      console.error("AdminSeal: Error initializing Seal session:", error);
      setAdminSealError(error.message || "Failed to initialize Seal session.");
      toast({
        title: "Admin Seal Error",
        description: error.message || "Failed to initialize Seal.",
        variant: "destructive",
      });
    } finally {
      setIsInitializingSealAdmin(false);
      console.log("AdminSeal: setIsInitializingSealAdmin set to false.");
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

  const [selectedTimesheetForWorklogView, setSelectedTimesheetForWorklogView] =
    useState<FetchedSuiTimesheet | null>(null);
  const [onChainBlobIds, setOnChainBlobIds] = useState<string[]>([]);
  const [isLoadingWorkLogMarkers, setIsLoadingWorkLogMarkers] = useState(false);
  const [decryptionResults, setDecryptionResults] = useState<
    Record<
      string,
      {
        url?: string;
        error?: string;
        data?: any;
        type?: string;
        rawDecrypted?: Uint8Array;
      }
    >
  >({});
  const [isDecrypting, setIsDecrypting] = useState<string | null>(null); // blobId of item being decrypted

  const ENCRYPTION_THRESHOLD_FOR_DECRYPT = 1; // Matching employee.tsx threshold

  // Effect to fetch work log markers (blobIds) when a timesheet is selected for view
  useEffect(() => {
    const fetchWorkLogBlobIds = async () => {
      if (!selectedTimesheetForWorklogView || !suiClient) {
        setOnChainBlobIds([]);
        return;
      }
      setIsLoadingWorkLogMarkers(true);
      setOnChainBlobIds([]); // Clear previous blobIds
      setDecryptionResults({}); // Clear previous decryption results
      console.log(
        `Fetching dynamic field names (blobIds) for timesheet: ${selectedTimesheetForWorklogView.id}`
      );
      try {
        const dynamicFieldsResponse = await suiClient.getDynamicFields({
          parentId: selectedTimesheetForWorklogView.id,
        });

        // As per example: dynamic field names are the blobIds
        const fetchedBlobIds = dynamicFieldsResponse.data
          .map((df) => {
            if (
              df.name?.type === "0x1::string::String" &&
              typeof df.name?.value === "string"
            ) {
              return df.name.value;
            }
            console.warn(
              "Skipping dynamic field with unexpected name structure:",
              df.name
            );
            return null;
          })
          .filter((value): value is string => value !== null);

        setOnChainBlobIds(fetchedBlobIds);
        if (fetchedBlobIds.length === 0) {
          toast({
            title: "No Log Markers",
            description:
              "No work log markers (blobIds) found attached to this timesheet on-chain.",
          });
        }
      } catch (error) {
        console.error("Error fetching work log blobIds:", error);
        toast({
          title: "Error Fetching Logs",
          description: "Could not load work log blobIds for the timesheet.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingWorkLogMarkers(false);
      }
    };

    if (selectedTimesheetForWorklogView && currentAdminTab === "worklog") {
      fetchWorkLogBlobIds();
    }
  }, [selectedTimesheetForWorklogView, suiClient, toast, currentAdminTab]);

  const handleDecryptWorkLog = async (blobId: string) => {
    if (
      !sealClientForAdmin ||
      !sessionKeyForAdmin ||
      !selectedTimesheetForWorklogView ||
      !packageId ||
      !suiClient
    ) {
      toast({
        title: "Prerequisites Missing",
        description:
          "Admin Seal session not ready, timesheet not selected, or client/packageId missing.",
        variant: "destructive",
      });
      return;
    }
    if (sessionKeyForAdmin.isExpired()) {
      toast({
        title: "Session Expired",
        description:
          "Admin Seal session key has expired. Please re-initialize.",
        variant: "destructive",
      });
      return;
    }

    setIsDecrypting(blobId);
    // Clear previous result for this specific blobId before attempting again
    setDecryptionResults((prev) => ({
      ...prev,
      [blobId]: {
        error: undefined,
        url: undefined,
        data: undefined,
        rawDecrypted: undefined,
      },
    }));

    console.log(`Attempting to download and decrypt: blobId=${blobId}`);

    let downloadedArrayBuffer: ArrayBuffer | null = null;

    try {
      // 1. Download from Walrus
      if (WALRUS_SERVICES.length === 0) {
        throw new Error("No Walrus services configured for download.");
      }
      // Use aggregator URL for downloading, assuming blobs are fetched from aggregators
      const selectedService = WALRUS_SERVICES[0]; // Or make selectable if multiple aggregators
      let baseUrl = selectedService.aggregatorUrl;
      baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl; // Remove trailing slash
      const walrusDownloadUrl = `${baseUrl}/v1/blobs/${blobId}`; // Standard path for blob retrieval

      console.log("Downloading from Walrus aggregator:", walrusDownloadUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const response = await fetch(walrusDownloadUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(
          `Failed to download blob ${blobId} from Walrus. Status: ${response.status} ${response.statusText}`
        );
      }
      downloadedArrayBuffer = await response.arrayBuffer();
      console.log(
        `Blob ${blobId} downloaded successfully (${downloadedArrayBuffer.byteLength} bytes).`
      );

      // 2. Parse Encrypted Object to get the fullSealPolicyId
      if (!downloadedArrayBuffer) throw new Error("Downloaded data is null.");
      const encryptedBlobBytes = new Uint8Array(downloadedArrayBuffer);
      const parsedEncryptedObject = EncryptedObject.parse(encryptedBlobBytes);
      const fullSealPolicyId = parsedEncryptedObject.id; // This is the ID for Seal SDK (fetchKeys, decrypt)
      console.log(`Parsed fullSealPolicyId for Seal SDK: ${fullSealPolicyId}`);

      // 3. Construct Transaction for seal_approve
      const tx = new Transaction();
      const sealApproveTarget =
        `${packageId}::whitelist::seal_approve` as `${string}::${string}::${string}`;
      tx.moveCall({
        target: sealApproveTarget,
        arguments: [
          tx.pure.vector("u8", fromHex(fullSealPolicyId)), // Use the policy ID from the blob
          tx.object(selectedTimesheetForWorklogView.id), // The Allowlist/Timesheet object ID
        ],
      });
      console.log(
        "Building transaction for seal_approve with policy ID:",
        fullSealPolicyId,
        "and timesheet:",
        selectedTimesheetForWorklogView.id
      );
      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      // 4. Seal SDK fetchKeys
      console.log("Fetching keys for Seal decryption...");
      await sealClientForAdmin.fetchKeys({
        ids: [fullSealPolicyId],
        txBytes,
        sessionKey: sessionKeyForAdmin,
        threshold: ENCRYPTION_THRESHOLD_FOR_DECRYPT,
      });
      console.log("Keys fetched successfully.");

      // 5. Seal SDK decrypt
      console.log("Decrypting blob data...");
      const decryptedDataArray = await sealClientForAdmin.decrypt({
        data: encryptedBlobBytes, // Use the original downloaded bytes
        sessionKey: sessionKeyForAdmin,
        txBytes,
      });
      console.log(
        `Data decrypted successfully (${decryptedDataArray.byteLength} bytes)`
      );

      // 6. Process Decrypted Data & Update State (Attempt to determine type)
      setDecryptionResults((prev) => ({
        ...prev,
        [blobId]: { rawDecrypted: decryptedDataArray }, // Store raw first
      }));

      // Try to parse as JSON (common for work logs)
      try {
        const decodedText = new TextDecoder().decode(decryptedDataArray);
        const jsonData = JSON.parse(decodedText);
        setDecryptionResults((prev) => ({
          ...prev,
          [blobId]: { ...prev[blobId], data: jsonData, type: "json" },
        }));
        toast({
          title: "Decryption Successful",
          description: `Blob ${blobId} content decrypted (JSON).`,
        });
        console.log("Decrypted content (JSON):", jsonData);
      } catch (jsonError) {
        // If not JSON, try to display as image (common for other use cases, maybe work log has a screenshot?)
        // This is a guess; adjust based on expected content types.
        console.log(
          "Could not parse decrypted data as JSON, attempting image display.",
          jsonError
        );
        try {
          const imageBlob = new Blob([decryptedDataArray], {
            type: "image/jpeg",
          }); // Or png, etc.
          const imageUrl = URL.createObjectURL(imageBlob);
          setDecryptionResults((prev) => ({
            ...prev,
            [blobId]: { ...prev[blobId], url: imageUrl, type: "image" },
          }));
          toast({
            title: "Decryption Successful",
            description: `Blob ${blobId} content decrypted (Image).`,
          });
        } catch (imageError) {
          console.error(
            "Could not create image URL from decrypted data:",
            imageError
          );
          setDecryptionResults((prev) => ({
            ...prev,
            [blobId]: {
              ...prev[blobId],
              error:
                "Decrypted, but cannot display (not JSON or common image).",
              type: "binary",
            },
          }));
          toast({
            title: "Decryption Note",
            description: `Blob ${blobId} decrypted but format not automatically viewable.`,
          });
        }
      }
    } catch (err: any) {
      console.error(`Error decrypting blob ${blobId}:`, err);
      let detailedError = err.message || "Decryption failed";
      if (err instanceof NoAccessError) {
        detailedError =
          "No access to decryption keys. Ensure you have permission for this policy.";
      }
      setDecryptionResults((prev) => ({
        ...prev,
        [blobId]: { error: detailedError },
      }));
      toast({
        title: "Decryption Error",
        description: detailedError,
        variant: "destructive",
      });
    } finally {
      setIsDecrypting(null);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Admin Dashboard
        </h1>
        <p className="text-gray-600">
          Manage timesheets and employee work records
        </p>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <Tabs
            value={currentAdminTab}
            onValueChange={(value) =>
              setCurrentAdminTab(
                value as "timesheet" | "worklog" | "pendingattachments"
              )
            }
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="timesheet"
                className="flex items-center space-x-2"
              >
                <Clock className="h-4 w-4" />
                <span>Manage Timesheet</span>
              </TabsTrigger>
              <TabsTrigger
                value="worklog"
                className="flex items-center space-x-2"
              >
                <Users className="h-4 w-4" />
                <span>Manage Employee Work Log</span>
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
              <AdminSealSetup
                initializeAdminSealSession={initializeAdminSealSession}
                isInitializingSealAdmin={isInitializingSealAdmin}
                sessionKeyForAdmin={sessionKeyForAdmin}
                adminSealError={adminSealError}
              />

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

            <TabsContent value="worklog" className="mt-6">
              {!selectedTimesheetForWorklogView ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Manage Employee Work Log</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Select a timesheet from the "Manage Timesheet" tab to view
                      its work log markers.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Work Log Blobs for: {selectedTimesheetForWorklogView.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">
                      Timesheet ID: {selectedTimesheetForWorklogView.id}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {isLoadingWorkLogMarkers ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />{" "}
                        <span className="ml-2">Loading blob IDs...</span>
                      </div>
                    ) : onChainBlobIds.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        No on-chain work log blob IDs found for this timesheet.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {onChainBlobIds.map((blobId) => (
                          <div
                            key={blobId}
                            className="border rounded-lg p-4 bg-card/50"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold">
                                  Blob ID:{" "}
                                  <span className="font-mono text-xs">
                                    {blobId}
                                  </span>
                                </p>
                                {/* Seal Policy ID is now derived after download, so not displayed directly from initial fetch */}
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleDecryptWorkLog(blobId)}
                                disabled={
                                  isDecrypting === blobId ||
                                  !sealClientForAdmin ||
                                  !sessionKeyForAdmin ||
                                  sessionKeyForAdmin.isExpired()
                                }
                              >
                                {isDecrypting === blobId ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Eye className="h-4 w-4 mr-2" />
                                )}
                                {isDecrypting === blobId
                                  ? "Decrypting..."
                                  : decryptionResults[blobId]?.url ||
                                    decryptionResults[blobId]?.data
                                  ? "View Again"
                                  : "Decrypt & View"}
                              </Button>
                            </div>
                            {decryptionResults[blobId]?.url &&
                              decryptionResults[blobId]?.type === "image" && (
                                <div className="mt-2">
                                  <p className="text-sm font-medium">
                                    Decrypted Image:
                                  </p>
                                  <img
                                    src={decryptionResults[blobId]?.url}
                                    alt={`Decrypted content for ${blobId}`}
                                    className="rounded-md border max-w-xs max-h-xs"
                                  />
                                </div>
                              )}
                            {decryptionResults[blobId]?.data &&
                              decryptionResults[blobId]?.type === "json" && (
                                <div className="mt-2">
                                  <p className="text-sm font-medium">
                                    Decrypted Data (JSON):
                                  </p>
                                  <pre className="text-xs bg-muted p-2 rounded-md overflow-auto">
                                    {JSON.stringify(
                                      decryptionResults[blobId]?.data,
                                      null,
                                      2
                                    )}
                                  </pre>
                                </div>
                              )}
                            {decryptionResults[blobId]?.rawDecrypted &&
                              !(
                                decryptionResults[blobId]?.data ||
                                decryptionResults[blobId]?.url
                              ) &&
                              decryptionResults[blobId]?.type === "binary" && (
                                <div className="mt-2">
                                  <p className="text-sm font-medium">
                                    Decrypted Data (Binary - first 100 bytes as
                                    hex):
                                  </p>
                                  <pre className="text-xs bg-muted p-2 rounded-md overflow-auto">
                                    {toHEX(
                                      decryptionResults[
                                        blobId
                                      ]?.rawDecrypted!.slice(0, 100)
                                    )}
                                  </pre>
                                </div>
                              )}
                            {decryptionResults[blobId]?.error && (
                              <p className="mt-2 text-sm text-destructive">
                                Error: {decryptionResults[blobId]?.error}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
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
