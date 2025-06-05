import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useWorkRecords } from "@/hooks/use-work-records";
import { useAppStore } from "@/lib/store";
import {
  Clock,
  Wallet,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import type { SalaryRecord } from "@shared/schema";
import {
  useSuiClient,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSignTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { useNetworkVariable } from "@/networkConfig";
import { SealClient, SessionKey, getAllowlistedKeyServers } from "@mysten/seal";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { EMPLOYEE_LOG_ADDRESS } from "@/lib/constants";
import { set as idbSet, get as idbGet, del as idbDel } from "idb-keyval";
import { TimesheetSelector } from "@/components/TimesheetSelector";
import {
  WorkRecordTab,
  DisplayableWorkRecord,
} from "@/components/WorkRecordTab";
import { SalaryTab, SalaryRecordToDisplay } from "@/components/SalaryTab";
import { processAndSubmitWorkLog } from "@/services/workLogManager";
import { WALRUS_SERVICES } from "@/services/walrusService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fromHex, toHex } from "@mysten/bcs";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { constructMoveCall, MoveCallConstructor } from "@/lib/suiUtils";
import { ToastAction } from "@/components/ui/toast";

// --- BEGIN Constants ---
// Ensure these are correctly set for your environment or move to networkConfig
const MODULE_WHITELIST = "whitelist";
const MODULE_EMPLOYEE_LOG = "employee_log";
const CLOCK_OBJECT_ID = "0x6"; // Standard Sui Clock object ID

const ENCRYPTION_THRESHOLD = 2; // Example: 2-out-of-N key servers

function createDailyEmployeeId(
  employeeAddr: string,
  policyObjectId: string // Typically the whitelist ID or a specific policy object ID
): string {
  const policyObjectBytes = fromHex(policyObjectId); // Ensure policyObjectId is a valid hex string if it's an object ID

  const date = new Date();
  // Use UTC to avoid timezone issues for daily IDs
  const dateString = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
  const encoder = new TextEncoder();
  const idData = encoder.encode(`${employeeAddr}_${dateString}_daily_access`);
  console.log(
    `Generated Seal ID for policy object ${policyObjectId}: ${employeeAddr}_${dateString}_daily_access`
  );
  const combined = new Uint8Array(policyObjectBytes.length + idData.length);
  combined.set(policyObjectBytes);
  combined.set(idData, policyObjectBytes.length);
  return toHex(combined);
}

// --- END Placeholder Constants and Helpers ---

// Helper function for daily Seal access verification
async function performDailySealAccessVerification(
  sealClient: SealClient,
  sessionKey: SessionKey,
  suiClient: SuiClient, // This type should now be recognized
  packageId: string,
  currentAddress: string,
  whitelistObjectId: string,
  toast: Function // Pass the toast function for user feedback
): Promise<boolean> {
  console.log(
    "Performing daily Seal access verification for:",
    currentAddress,
    "on whitelist:",
    whitelistObjectId
  );
  try {
    const employeePolicyId = createDailyEmployeeId(
      currentAddress,
      whitelistObjectId
    );
    const dataToEncrypt = new Uint8Array([1]); // Dummy data to encrypt/decrypt

    console.log(`Encrypting with policy ID: ${employeePolicyId}`);
    const { encryptedObject } = await sealClient.encrypt({
      threshold: ENCRYPTION_THRESHOLD,
      packageId: packageId,
      id: employeePolicyId,
      data: dataToEncrypt,
    });

    if (!encryptedObject) {
      throw new Error("Failed to encrypt daily access token.");
    }
    console.log("Daily access token encrypted.");

    const txbSealApprove = new Transaction();
    const sealApproveTxConstructor = constructMoveCall(
      packageId,
      whitelistObjectId
    );
    sealApproveTxConstructor(txbSealApprove, employeePolicyId);

    const sealApproveTxBytes = await txbSealApprove.build({
      client: suiClient, // Use the passed suiClient instance
      onlyTransactionKind: true,
    });
    console.log("Seal approve transaction bytes built.");

    console.log("Fetching keys for Seal approval...");
    await sealClient.fetchKeys({
      ids: [employeePolicyId],
      txBytes: sealApproveTxBytes,
      sessionKey,
      threshold: ENCRYPTION_THRESHOLD,
    });
    console.log("Keys fetched successfully.");

    console.log("Attempting Seal decryption to verify daily access...");
    const decryptedPayload = await sealClient.decrypt({
      data: encryptedObject,
      sessionKey: sessionKey,
      txBytes: sealApproveTxBytes,
    });

    if (decryptedPayload && decryptedPayload[0] === 1) {
      console.log("Seal daily access approved!");
      toast({
        title: "Seal Access Verified",
        description: "Daily access grant confirmed.",
        variant: "default",
      });
      return true;
    }
    console.warn("Seal daily access DENIED or decryption failed.");
    toast({
      title: "Seal Access Denied",
      description: "Could not verify daily access grant with Seal.",
      variant: "destructive",
    });
    return false;
  } catch (error: any) {
    console.error("Error during daily Seal access verification:", error);
    toast({
      title: "Seal Verification Error",
      description:
        error.message ||
        "An unexpected error occurred during Seal verification.",
      variant: "destructive",
    });
    return false;
  }
}

export default function EmployeePage() {
  const {
    currentEmployeeTab,
    setCurrentEmployeeTab,
    currentWalletAddress,
    availableTimesheets,
    selectedTimesheetForCheckin,
    setSelectedTimesheetForCheckin,
  } = useAppStore();
  console.log("availableTimesheets", availableTimesheets);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const [isClaimingSalary, setIsClaimingSalary] = useState(false);
  const [
    selectedWalrusServiceIdForUpload,
    setSelectedWalrusServiceIdForUpload,
  ] = useState<string | undefined>(
    WALRUS_SERVICES.length > 0 ? WALRUS_SERVICES[0].id : undefined
  );
  const [markerDataForAdminDisplay, setMarkerDataForAdminDisplay] = useState<
    string | null
  >(null);

  // State for on-chain work records
  const [onChainWorkRecords, setOnChainWorkRecords] = useState<
    DisplayableWorkRecord[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isActuallyCheckedInOnChain, setIsActuallyCheckedInOnChain] =
    useState(false);
  const [currentOnChainCheckInRecord, setCurrentOnChainCheckInRecord] =
    useState<DisplayableWorkRecord | null>(null);

  // Calculate today's hours based on on-chain data if checked in
  const [todaysHoursOnChain, setTodaysHoursOnChain] = useState<number>(0);

  // Sui hooks
  const suiClientFromHook = useSuiClient();
  const { mutateAsync: signAndExecuteTransactionMutation } =
    useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage();
  const packageId = useNetworkVariable("packageId");

  // State for Seal Client and Session Key
  const [sealClient, setSealClient] = useState<SealClient | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isSealSessionInitializing, setIsSealSessionInitializing] =
    useState(false);
  const [sealSessionError, setSealSessionError] = useState<string | null>(null);

  const initSealInProgressRef = useRef(false); // Ref to track ongoing initialization

  // Function to initialize Seal Client and SessionKey
  const initializeSealSession = useCallback(async () => {
    if (initSealInProgressRef.current) {
      console.log("EmployeePage: Seal initialization already in progress.");
      return false;
    }

    // Quick exit: If we already have a valid session in state, do nothing.
    if (sealClient && sessionKey && !sessionKey.isExpired()) {
      console.log(
        "EmployeePage: Seal session is already valid and active in state."
      );
      toast({
        title: "Seal Session Ready",
        description: "Using existing active session.",
        variant: "default",
      });
      return true;
    }

    // Prerequisites check
    if (!currentAccount?.address || !packageId || !suiClientFromHook) {
      console.log("EmployeePage: Prerequisites for Seal init not met.");
      setSealSessionError("Wallet not connected or network misconfigured.");
      return false;
    }

    console.log("EmployeePage: Starting Seal session initialization...");
    initSealInProgressRef.current = true;
    setIsSealSessionInitializing(true);
    setSealSessionError(null);

    try {
      const client =
        sealClient ??
        new SealClient({
          suiClient: suiClientFromHook as any,
          serverConfigs: getAllowlistedKeyServers("testnet").map((id) => ({
            objectId: id,
            weight: 1,
          })),
          verifyKeyServers: false,
        });

      if (!sealClient) {
        setSealClient(client);
        console.log("EmployeePage: SealClient instance created.");
      }

      const sessionKeyIdbKey = `seal-session-key-${currentAccount.address}-${packageId}`;

      // Attempt to load from IDB
      const storedSessionData = await idbGet(sessionKeyIdbKey);
      if (
        storedSessionData &&
        storedSessionData.suiAddress === currentAccount.address
      ) {
        console.log("EmployeePage: Found session key in IDB, importing...");
        try {
          const importedSk = await SessionKey.import(
            storedSessionData.exportedKey,
            new SuiClient({ url: getFullnodeUrl("testnet") })
          );
          if (!importedSk.isExpired()) {
            importedSk.setPersonalMessageSignature(storedSessionData.signature);
            setSessionKey(importedSk);
            console.log(
              "EmployeePage: SessionKey imported successfully and is valid."
            );
            toast({ title: "Seal Session Ready", variant: "default" });
            return true; // SUCCESS
          } else {
            console.log(
              "EmployeePage: Stored session key is expired. Deleting from IDB."
            );
            await idbDel(sessionKeyIdbKey);
          }
        } catch (importError) {
          console.warn(
            "EmployeePage: Failed to import session key, will create a new one.",
            importError
          );
          await idbDel(sessionKeyIdbKey); // Clean up corrupted key
        }
      }

      // If we're here, we need a new key
      console.log("EmployeePage: Creating new SessionKey...");
      const sk = new SessionKey({
        address: currentAccount.address,
        packageId: packageId!,
        ttlMin: 30,
        suiClient: new SuiClient({ url: getFullnodeUrl("testnet") }),
      });
      const personalMessage = sk.getPersonalMessage();
      toast({
        title: "Seal Session Activation",
        description: "Please sign the message in your wallet to activate Seal.",
        duration: 7000,
      });
      const { signature: signedPersonalMessage } =
        await signPersonalMessageAsync({ message: personalMessage });
      sk.setPersonalMessageSignature(signedPersonalMessage);

      console.log("EmployeePage: New SessionKey signed. Storing in IDB...");
      await idbSet(sessionKeyIdbKey, {
        exportedKey: sk.export(),
        signature: signedPersonalMessage,
        suiAddress: currentAccount.address,
      });

      setSessionKey(sk);
      toast({ title: "Seal Session Ready", variant: "default" });
      return true; // SUCCESS
    } catch (error: any) {
      console.error("EmployeePage: CATCH in initializeSealSession:", error);
      setSealSessionError(
        error.message || "Failed to initialize Seal session."
      );
      toast({
        title: "Seal Session Error",
        description: error.message || "Failed to initialize Seal.",
        variant: "destructive",
      });
      // Cleanup on error
      setSealClient(null);
      setSessionKey(null);
      return false; // Initialization failed
    } finally {
      setIsSealSessionInitializing(false);
      initSealInProgressRef.current = false; // Reset ref lock
      console.log("EmployeePage: initializeSealSession FINALLY block.");
    }
  }, [
    currentAccount?.address,
    packageId,
    suiClientFromHook,
    toast,
    signPersonalMessageAsync,
    sealClient,
    sessionKey,
  ]);

  // Effect to clear Seal session if account/network changes
  useEffect(() => {
    // This effect now ONLY handles cleanup. Initialization is done on-demand by user action.
    return () => {
      console.log(
        "useEffect for Seal: CLEANUP. Wallet/network changed. Clearing Seal session states."
      );
      setSealClient(null);
      setSessionKey(null);
      setIsSealSessionInitializing(false);
      initSealInProgressRef.current = false;
    };
  }, [currentAccount?.address, packageId]);

  const fetchAndProcessWorkHistory = useCallback(async () => {
    if (!suiClientFromHook || !packageId || !currentAccount?.address) {
      setOnChainWorkRecords([]);
      return;
    }
    setIsLoadingHistory(true);
    console.log("Fetching on-chain work history for", currentAccount.address);

    try {
      // Fetch CheckIn Events
      const checkInEventsPromise = suiClientFromHook.queryEvents({
        query: {
          MoveEventType: `${packageId}::events::EmployeeCheckInEvent`,
        },
        order: "descending",
        limit: 50,
      });

      // Fetch CheckOut Events
      const checkOutEventsPromise = suiClientFromHook.queryEvents({
        query: {
          MoveEventType: `${packageId}::events::EmployeeCheckOutEvent`,
        },
        order: "descending",
        limit: 50,
      });

      const [checkInEventsResponse, checkOutEventsResponse] = await Promise.all(
        [checkInEventsPromise, checkOutEventsPromise]
      );

      const userCheckInEvents = checkInEventsResponse.data
        .filter(
          (event) =>
            event.parsedJson &&
            (event.parsedJson as any).employee === currentAccount.address
        )
        .map(
          (event) =>
            event.parsedJson as { employee: string; check_in_time: string }
        );

      const userCheckOutEvents = checkOutEventsResponse.data
        .filter(
          (event) =>
            event.parsedJson &&
            (event.parsedJson as any).employee === currentAccount.address
        )
        .map(
          (event) =>
            event.parsedJson as {
              employee: string;
              check_in_time: string;
              check_out_time: string;
              duration: string;
            }
        );

      console.log("Filtered User CheckIn Events:", userCheckInEvents);
      console.log("Filtered User CheckOut Events:", userCheckOutEvents);

      const processedRecords: DisplayableWorkRecord[] = [];
      const checkInsMap = new Map<
        string,
        { employee: string; check_in_time: string }
      >();

      userCheckInEvents.forEach((cin) => {
        checkInsMap.set(cin.check_in_time, cin);
      });

      userCheckOutEvents.forEach((cout) => {
        const checkInTimeMs = parseInt(cout.check_in_time);
        const checkOutTimeMs = parseInt(cout.check_out_time);
        const durationMs = parseInt(cout.duration);

        const cinEvent = checkInsMap.get(cout.check_in_time);
        if (cinEvent) {
          processedRecords.push({
            id: `${cout.employee}-${cout.check_in_time}`,
            employee: cout.employee,
            date: new Date(checkInTimeMs).toLocaleDateString(),
            checkInDisplay: new Date(checkInTimeMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            checkOutDisplay: new Date(checkOutTimeMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            durationDisplay: `${Math.floor(
              durationMs / (1000 * 60 * 60)
            )}h ${Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))}m`,
            status: "Completed (on-chain)",
            checkInTimestampMs: checkInTimeMs,
            checkOutTimestampMs: checkOutTimeMs,
          });
          checkInsMap.delete(cout.check_in_time);
        } else {
          processedRecords.push({
            id: `${cout.employee}-${cout.check_in_time}-orphan_co`,
            employee: cout.employee,
            date: new Date(checkOutTimeMs).toLocaleDateString(),
            checkInDisplay:
              new Date(checkInTimeMs).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }) + " (Unmatched)",
            checkOutDisplay: new Date(checkOutTimeMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            durationDisplay: `${Math.floor(
              durationMs / (1000 * 60 * 60)
            )}h ${Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))}m`,
            status: "Orphaned Check-out",
            checkInTimestampMs: checkInTimeMs,
            checkOutTimestampMs: checkOutTimeMs,
          });
        }
      });

      checkInsMap.forEach((cin) => {
        const checkInTimeMs = parseInt(cin.check_in_time);
        const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
        if (checkInTimeMs > fortyEightHoursAgo) {
          processedRecords.push({
            id: `${cin.employee}-${cin.check_in_time}`,
            employee: cin.employee,
            date: new Date(checkInTimeMs).toLocaleDateString(),
            checkInDisplay: new Date(checkInTimeMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            checkOutDisplay: null,
            durationDisplay: null,
            status: "In Progress (on-chain)",
            checkInTimestampMs: checkInTimeMs,
          });
        }
      });

      processedRecords.sort(
        (a, b) => b.checkInTimestampMs - a.checkInTimestampMs
      );
      setOnChainWorkRecords(processedRecords);

      const currentInProgressOnChain = processedRecords.find(
        (r) => r.status === "In Progress (on-chain)"
      );
      if (currentInProgressOnChain) {
        setIsActuallyCheckedInOnChain(true);
        setCurrentOnChainCheckInRecord(currentInProgressOnChain);
      } else {
        setIsActuallyCheckedInOnChain(false);
        setCurrentOnChainCheckInRecord(null);
      }
    } catch (error) {
      console.error("Failed to fetch or process on-chain work history:", error);
      toast({
        title: "History Load Error",
        description: "Could not load on-chain work records.",
        variant: "destructive",
      });
      setOnChainWorkRecords([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [
    suiClientFromHook,
    packageId,
    currentAccount?.address,
    toast,
    setOnChainWorkRecords,
    setIsLoadingHistory,
    setIsActuallyCheckedInOnChain,
    setCurrentOnChainCheckInRecord,
  ]); // Added all dependencies

  const employeeSpecificTimesheets = availableTimesheets.filter((ts) =>
    ts.list.includes(currentAccount?.address || "")
  );

  useEffect(() => {
    if (
      employeeSpecificTimesheets.length > 0 &&
      (!selectedTimesheetForCheckin ||
        !employeeSpecificTimesheets.find(
          (ts) => ts.id === selectedTimesheetForCheckin.id
        ))
    ) {
      setSelectedTimesheetForCheckin(employeeSpecificTimesheets[0]);
    } else if (
      employeeSpecificTimesheets.length === 0 &&
      selectedTimesheetForCheckin
    ) {
      setSelectedTimesheetForCheckin(null);
    }
  }, [
    employeeSpecificTimesheets,
    selectedTimesheetForCheckin,
    setSelectedTimesheetForCheckin,
  ]);

  const { data: salaryRecords = [], isLoading: salaryLoading } = useQuery<
    SalaryRecord[]
  >({
    queryKey: [
      "/api/salary-records",
      { employeeAddress: currentAccount?.address },
    ],
    enabled: !!currentAccount?.address,
  });

  // useEffect to fetch on-chain work history
  useEffect(() => {
    fetchAndProcessWorkHistory();
  }, [fetchAndProcessWorkHistory]); // Dependency is now the memoized function itself

  useEffect(() => {
    if (isActuallyCheckedInOnChain && currentOnChainCheckInRecord) {
      const checkInTime = currentOnChainCheckInRecord.checkInTimestampMs;
      const now = Date.now();
      const durationMs = now - checkInTime;
      const hours = durationMs / (1000 * 60 * 60);
      setTodaysHoursOnChain(Math.round(hours * 10) / 10); // Rounded to one decimal place

      // Optional: set an interval to update this live, clear on checkout
      const intervalId = setInterval(() => {
        const liveDurationMs = Date.now() - checkInTime;
        const liveHours = liveDurationMs / (1000 * 60 * 60);
        setTodaysHoursOnChain(Math.round(liveHours * 10) / 10);
      }, 60000); // Update every minute
      return () => clearInterval(intervalId);
    } else {
      // If not checked in, or no record, find the last completed record for today from onChainWorkRecords
      const todayDateString = new Date().toLocaleDateString();
      let todayCompletedMinutes = 0;
      onChainWorkRecords.forEach((record) => {
        if (
          record.date === todayDateString &&
          record.status === "Completed (on-chain)" &&
          record.durationDisplay
        ) {
          const match = record.durationDisplay.match(/(\d+)h (\d+)m/);
          if (match) {
            todayCompletedMinutes +=
              parseInt(match[1]) * 60 + parseInt(match[2]);
          }
        }
      });
      setTodaysHoursOnChain(Math.round((todayCompletedMinutes / 60) * 10) / 10);
    }
  }, [
    isActuallyCheckedInOnChain,
    currentOnChainCheckInRecord,
    onChainWorkRecords,
  ]);

  const handleCheckIn = async () => {
    if (!selectedTimesheetForCheckin) {
      toast({
        title: "No Timesheet Selected",
        description: "Please select a timesheet to check in.",
        variant: "destructive",
      });
      return;
    }
    if (!currentAccount?.address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet address.",
        variant: "destructive",
      });
      return;
    }

    const sealSessionReady = await initializeSealSession();
    if (
      !sealSessionReady ||
      !sealClient ||
      !sessionKey ||
      sessionKey.isExpired()
    ) {
      toast({
        title: "Seal Session Not Ready",
        description:
          "Your Seal session is not active or has expired. Please re-initialize.",
        variant: "destructive",
        action: (
          <ToastAction altText="Re-initialize" onClick={initializeSealSession}>
            Re-initialize
          </ToastAction>
        ),
      });
      if (sessionKey?.isExpired()) console.log("CheckIn: Session key expired.");
      return;
    }

    toast({
      title: "Processing Check-In...",
      description: "Verifying Seal access...",
    });

    try {
      const whitelistObjectId = selectedTimesheetForCheckin.id;
      if (!whitelistObjectId) {
        toast({
          title: "Policy Object ID Missing",
          description:
            "Selected timesheet does not have a policy object ID for Seal.",
          variant: "destructive",
        });
        return;
      }

      // Use the new helper function for Seal verification
      const accessApproved = await performDailySealAccessVerification(
        sealClient,
        sessionKey,
        suiClientFromHook,
        packageId!,
        currentAccount.address,
        whitelistObjectId,
        toast
      );

      if (!accessApproved) {
        // Error toast is handled by performDailySealAccessVerification
        return;
      }

      // If access approved, proceed with the actual check-in transaction
      const txbCheckIn = new Transaction();
      const requestTarget =
        `${packageId}::${MODULE_EMPLOYEE_LOG}::check_in` as `${string}::${string}::${string}`;
      txbCheckIn.moveCall({
        target: requestTarget,
        arguments: [
          txbCheckIn.object(EMPLOYEE_LOG_ADDRESS),
          txbCheckIn.object(whitelistObjectId!),
          txbCheckIn.object(CLOCK_OBJECT_ID),
        ],
      });

      console.log("Submitting actual check-in transaction...");
      const checkInSubmissionResult = await signAndExecuteTransactionMutation({
        transaction: txbCheckIn,
      });

      console.log(
        "Check-In Transaction Digest:",
        checkInSubmissionResult.digest
      );

      if (checkInSubmissionResult.digest) {
        toast({
          title: "Transaction Submitted",
          description: `Digest: ${checkInSubmissionResult.digest.substring(
            0,
            10
          )}... Waiting for finality...`,
        });
        // Wait for the transaction to be processed by the network
        await suiClientFromHook.waitForTransaction({
          digest: checkInSubmissionResult.digest,
        });
        // Then, fetch the full transaction details
        const fullCheckInResponse = await suiClientFromHook.getTransactionBlock(
          {
            digest: checkInSubmissionResult.digest,
            options: { showEffects: true, showEvents: true },
          }
        );

        if (fullCheckInResponse.effects?.status.status === "success") {
          toast({
            title: "Check-In Successful!",
            description: `Transaction Digest: ${checkInSubmissionResult.digest.substring(
              0,
              10
            )}...`,
          });
          queryClient.invalidateQueries({
            queryKey: ["workRecords", selectedTimesheetForCheckin?.id],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/salary-records"],
          });

          setIsActuallyCheckedInOnChain(true);
          let optimisticCheckInTimeMs = Date.now();

          const checkInEventFromFullResponse = fullCheckInResponse.events?.find(
            (event: any) =>
              event.type === `${packageId}::events::EmployeeCheckInEvent` &&
              event.parsedJson?.employee === currentAccount.address
          );

          if (checkInEventFromFullResponse) {
            optimisticCheckInTimeMs = parseInt(
              (checkInEventFromFullResponse.parsedJson as any).check_in_time
            );
            console.log(
              "Optimistic update using event time from full response:",
              new Date(optimisticCheckInTimeMs).toLocaleTimeString()
            );
            toast({
              title: "On-chain Check-in Verified",
              description: `Event found. Check-in time: ${new Date(
                optimisticCheckInTimeMs
              ).toLocaleTimeString()}`,
            });
          } else {
            // Fallback: if event not in full response, try querying (as was done before) or use Date.now()
            console.log(
              "Check-in event not immediately in full response, attempting quick query for optimistic update..."
            );
            try {
              const eventsResult = await suiClientFromHook.queryEvents({
                query: {
                  MoveEventType: `${packageId}::events::EmployeeCheckInEvent`,
                },
                order: "descending",
                limit: 10,
              });
              const userCheckInEvent = eventsResult.data.find(
                (event) =>
                  event.parsedJson &&
                  (event.parsedJson as any).employee === currentAccount.address
              );
              if (userCheckInEvent) {
                optimisticCheckInTimeMs = parseInt(
                  (userCheckInEvent.parsedJson as any).check_in_time
                );
                console.log(
                  "Optimistic update using event time from fallback query:",
                  new Date(optimisticCheckInTimeMs).toLocaleTimeString()
                );
                toast({
                  title: "On-chain Check-in Verified (Queried)",
                  description: `Event found. Check-in time: ${new Date(
                    optimisticCheckInTimeMs
                  ).toLocaleTimeString()}`,
                });
              }
            } catch (e) {
              console.warn(
                "Error querying event for optimistic update fallback:",
                e
              );
            }
          }

          setCurrentOnChainCheckInRecord({
            id: `optimistic-${optimisticCheckInTimeMs}`,
            employee: currentAccount.address!,
            date: new Date(optimisticCheckInTimeMs).toLocaleDateString(),
            checkInDisplay: new Date(
              optimisticCheckInTimeMs
            ).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            checkOutDisplay: null,
            durationDisplay: null,
            status: "In Progress (on-chain)",
            checkInTimestampMs: optimisticCheckInTimeMs,
          });
          fetchAndProcessWorkHistory();
        } else {
          console.error(
            "Check-in transaction failed or had errors.",
            fullCheckInResponse.effects?.status.error
          );
          toast({
            title: "Check-In Failed",
            description:
              fullCheckInResponse.effects?.status.error ||
              "Transaction failed on-chain.",
            variant: "destructive",
          });
        }
      } else {
        console.error(
          "Check-in transaction submission failed, no digest returned."
        );
        toast({
          title: "Check-In Submission Failed",
          description: "Could not submit transaction to the network.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error in employee check-in flow:", error);
      toast({
        title: "Error During Check-In",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
      if (error.cause) console.error("Cause:", error.cause);
      if (error.logs) console.error("Transaction Logs:", error.logs);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedTimesheetForCheckin) {
      toast({
        title: "No Timesheet Selected",
        description: "Please select a timesheet to check out.",
        variant: "destructive",
      });
      return;
    }
    if (!currentAccount?.address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet address.",
        variant: "destructive",
      });
      return;
    }

    const sealSessionReady = await initializeSealSession();
    if (
      !sealSessionReady ||
      !sealClient ||
      !sessionKey ||
      sessionKey.isExpired()
    ) {
      toast({
        title: "Seal Session Not Ready",
        description:
          "Your Seal session is not active or has expired. Please re-initialize.",
        variant: "destructive",
        action: (
          <ToastAction altText="Re-initialize" onClick={initializeSealSession}>
            Re-initialize
          </ToastAction>
        ),
      });
      if (sessionKey?.isExpired())
        console.log("Checkout: Session key expired.");
      return;
    }

    // On-chain check-in verification
    toast({
      title: "Verifying Check-in Status...",
      description: "Checking current on-chain status before checkout.",
    });
    try {
      console.log(
        `Fetching EmployeeLastCheckInLog object: ${EMPLOYEE_LOG_ADDRESS}`
      );
      const logObjectResponse = await suiClientFromHook.getObject({
        id: EMPLOYEE_LOG_ADDRESS,
        options: { showContent: true },
      });
      if (!logObjectResponse.data || logObjectResponse.error) {
        console.error(
          "Failed to fetch EmployeeLastCheckInLog object:",
          logObjectResponse.error
        );
        toast({
          title: "Verification Failed",
          description: "Could not fetch check-in log data.",
          variant: "destructive",
        });
        return;
      }
      const logObjectFields = (logObjectResponse.data.content as any)?.fields;
      if (!logObjectFields || !logObjectFields.last_check_ins?.fields?.id?.id) {
        console.error(
          "Invalid EmployeeLastCheckInLog object structure:",
          logObjectFields
        );
        toast({
          title: "Verification Failed",
          description: "Invalid check-in log structure.",
          variant: "destructive",
        });
        return;
      }
      const lastCheckInsTableId = logObjectFields.last_check_ins.fields.id.id;
      console.log(
        `Querying table ID ${lastCheckInsTableId} for employee: ${currentAccount.address}`
      );
      const checkInRecordField = await suiClientFromHook.getDynamicFieldObject({
        parentId: lastCheckInsTableId,
        name: { type: "address", value: currentAccount.address },
      });
      if (
        checkInRecordField.error ||
        !checkInRecordField.data ||
        !(checkInRecordField.data.content as any)?.fields?.value
      ) {
        console.log(
          "No active check-in record found for user:",
          currentAccount.address,
          "Error:",
          checkInRecordField.error
        );
        toast({
          title: "Checkout Blocked",
          description: "No active check-in found. Please check in first.",
          variant: "destructive",
        });
        return;
      }
      const lastCheckInTimestamp = (checkInRecordField.data.content as any)
        .fields.value;
      console.log(
        `Active check-in found. Timestamp: ${lastCheckInTimestamp}. Proceeding with Seal verification for checkout.`
      );
      // On-chain check-in verified, can proceed to Seal verification for checkout context
    } catch (e: any) {
      console.error(
        "Error during on-chain check-in verification for checkout:",
        e
      );
      toast({
        title: "Verification Error",
        description: e.message || "Failed to verify check-in status.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Processing Check-Out...",
      description: "Verifying Seal access for checkout context...",
    });

    try {
      const whitelistObjectId = selectedTimesheetForCheckin.id;
      // Use the new helper function for Seal verification in checkout context
      const accessApproved = await performDailySealAccessVerification(
        sealClient,
        sessionKey,
        suiClientFromHook, // Pass the suiClient from the hook
        packageId!,
        currentAccount.address,
        whitelistObjectId,
        toast
      );

      if (!accessApproved) {
        // If Seal access for checkout context is denied, we might still allow the on-chain checkout to proceed
        // but warn the user that subsequent log processing might fail if Seal was intended as a gate.
        // The current performDailySealAccessVerification shows a destructive toast and returns false.
        // Depending on desired behavior, you might want a softer failure here or proceed with caution.
        console.warn(
          "Seal daily access for checkout context was not approved. Proceeding with on-chain checkout anyway."
        );
        toast({
          title: "Seal Context Note",
          description:
            "Seal access for checkout context failed. On-chain checkout will proceed.",
          variant: "destructive",
        });
        // For now, if it fails, let's be consistent and stop, as the original code implied it was a necessary step.
        return;
      }

      // If access approved, proceed with the actual check-out transaction
      const txbCheckOut = new Transaction();
      const checkOutTarget =
        `${packageId}::${MODULE_EMPLOYEE_LOG}::check_out` as `${string}::${string}::${string}`;
      txbCheckOut.moveCall({
        target: checkOutTarget,
        arguments: [
          txbCheckOut.object(EMPLOYEE_LOG_ADDRESS),
          txbCheckOut.object(whitelistObjectId),
          txbCheckOut.object(CLOCK_OBJECT_ID),
        ],
      });

      console.log("Submitting actual check-out transaction...");
      const checkOutSubmissionResult = await signAndExecuteTransactionMutation({
        transaction: txbCheckOut,
      });
      console.log(
        "Check-Out Transaction Digest:",
        checkOutSubmissionResult.digest
      );

      if (checkOutSubmissionResult.digest) {
        toast({
          title: "Transaction Submitted",
          description: `Digest: ${checkOutSubmissionResult.digest.substring(
            0,
            10
          )}... Waiting for finality...`,
        });
        await suiClientFromHook.waitForTransaction({
          digest: checkOutSubmissionResult.digest,
        });
        const fullCheckOutResponse =
          await suiClientFromHook.getTransactionBlock({
            digest: checkOutSubmissionResult.digest,
            options: { showEffects: true, showEvents: true },
          });

        if (fullCheckOutResponse.effects?.status.status === "success") {
          console.log("Checkout successful on-chain!");
          toast({
            title: "Check-Out Successful!",
            description: `Transaction Digest: ${checkOutSubmissionResult.digest.substring(
              0,
              10
            )}...`,
          });
          queryClient.invalidateQueries({
            queryKey: ["workRecords", selectedTimesheetForCheckin?.id],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/salary-records"] });

          let eventDataForWalrus: EmployeeCheckoutEventData | null = null;

          const userCheckOutEventFromFullResponse =
            fullCheckOutResponse.events?.find(
              (e: any) =>
                e.type.endsWith("::events::EmployeeCheckOutEvent") &&
                e.parsedJson &&
                (e.parsedJson as any).employee === currentAccount.address
            );

          if (userCheckOutEventFromFullResponse) {
            eventDataForWalrus =
              userCheckOutEventFromFullResponse.parsedJson as any;
            console.log(
              "User's specific CheckOut Event from full transaction response:",
              eventDataForWalrus
            );
          } else {
            console.log(
              "No specific check-out event found in full transaction events, querying..."
            );
            try {
              const eventsResult = await suiClientFromHook.queryEvents({
                query: {
                  MoveEventType: `${packageId}::events::EmployeeCheckOutEvent`,
                },
                order: "descending",
                limit: 10,
              });
              const userQueriedCheckOutEvent = eventsResult.data.find(
                (event) =>
                  event.parsedJson &&
                  (event.parsedJson as any).employee === currentAccount.address
              );
              if (userQueriedCheckOutEvent) {
                eventDataForWalrus = userQueriedCheckOutEvent.parsedJson as any;
                console.log(
                  "User's specific queried CheckOut Event:",
                  eventDataForWalrus
                );
                toast({
                  title: "On-chain Check-out Verified (Queried)",
                  description: `Duration: ${Math.floor(
                    parseInt(eventDataForWalrus?.duration ?? "0") / 60000
                  )} mins.`,
                });
              }
            } catch (queryEventError) {
              console.warn(
                "Error querying for specific checkout event immediately after transaction:",
                queryEventError
              );
            }
          }

          if (eventDataForWalrus) {
            const confirmedEventData = eventDataForWalrus;
            try {
              toast({
                title: "Processing Work Log...",
                description:
                  "Encrypting and uploading work log to secure storage.",
              });

              if (!selectedTimesheetForCheckin)
                throw new Error(
                  "Selected timesheet is not available for work log processing."
                );
              if (!sessionKey || !sealClient)
                throw new Error(
                  "Seal client or session key not available for work log processing."
                );
              if (!packageId)
                throw new Error(
                  "Package ID not available for work log processing."
                );
              if (!currentAccount?.address)
                throw new Error("Current wallet address is not available.");

              const {
                blobId: submittedBlobId,
                sealLogId: submittedSealLogId,
                originalWorkLogData,
              } = await processAndSubmitWorkLog({
                employeeEventData: confirmedEventData,
                timesheet: {
                  id: selectedTimesheetForCheckin.id,
                  name: selectedTimesheetForCheckin.name,
                },
                sealClient: sealClient,
                packageId: packageId!,
                encryptionThreshold: ENCRYPTION_THRESHOLD,
                selectedWalrusServiceId: selectedWalrusServiceIdForUpload,
              });

              const pendingMarkerForAdmin = {
                blobId: submittedBlobId,
                sealLogId: submittedSealLogId,
                timesheetId: selectedTimesheetForCheckin.id,
                timesheetCapId: selectedTimesheetForCheckin.capId,
                employeeAddress: currentAccount.address,
                originalWorkLogData: originalWorkLogData,
                timestamp: Date.now(),
                // No status here, admin side will manage its own list's status if needed
              };

              const markerStringForAdmin = JSON.stringify(
                pendingMarkerForAdmin,
                null,
                2
              );

              // Store in localStorage for easy retrieval by employee if needed
              try {
                localStorage.setItem(
                  "latestPendingLogMarkerForAdmin",
                  markerStringForAdmin
                );
              } catch (e) {
                console.warn(
                  "Could not save marker string to localStorage:",
                  e
                );
              }

              // Save to employee's own IndexedDB as a backup/personal record
              const localMarkersKey = `my-submitted-log-markers-${
                currentAccount.address
              }-${Date.now()}`; // Different key for employee's own records
              const existingLocalMarkers =
                (await idbGet(localMarkersKey)) || [];
              existingLocalMarkers.push({
                ...pendingMarkerForAdmin,
                status: "submittedToAdminQueue",
              }); // Employee knows it's submitted
              await idbSet(localMarkersKey, existingLocalMarkers);

              toast({
                title: "Work Log Uploaded!",
                description:
                  "Please provide the following data string to your admin for processing.",
                duration: 15000, // Long duration for user to see/copy
              });

              // Display the string for the employee to copy
              // Ideally, use a modal or a dedicated UI element. alert() is simple but not great for copying.
              // A better approach would be to set this string in a state variable and display it in a <textarea readOnly>.
              // For now, logging and alerting.
              console.log(
                "ACTION REQUIRED: Copy and provide this to your admin:",
                markerStringForAdmin
              );
              setMarkerDataForAdminDisplay(markerStringForAdmin);
            } catch (logError: any) {
              console.error(
                "Error during work log processing and local save:",
                logError
              );
              toast({
                title: "Work Log Processing Error",
                description:
                  logError.message || "Failed to process or store work log.",
                variant: "destructive",
              });
            }
          } else {
            console.log(
              "No specific check-out event data immediately found for Walrus logging."
            );
            toast({
              title: "Log Details Pending",
              description:
                "Check-out successful. Work log details will be processed shortly.",
              variant: "default",
            });
          }
          fetchAndProcessWorkHistory();
        } else {
          console.error(
            "Checkout transaction failed or had errors.",
            fullCheckOutResponse.effects?.status.error
          );
          toast({
            title: "Check-Out Failed",
            description:
              fullCheckOutResponse.effects?.status.error ||
              "Transaction failed on-chain.",
            variant: "destructive",
          });
        }
      } else {
        console.error(
          "Check-out transaction submission failed, no digest returned."
        );
        toast({
          title: "Check-Out Submission Failed",
          description: "Could not submit transaction to the network.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error in employee check-out flow:", error);
      toast({
        title: "Error During Check-Out",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
      if (error.cause) console.error("Cause:", error.cause);
      if (error.logs) console.error("Transaction Logs:", error.logs.join("\n"));
    }
  };

  const handleTimesheetSelection = (timesheetId: string) => {
    const selected = availableTimesheets.find((ts) => ts.id === timesheetId);
    if (selected) {
      setSelectedTimesheetForCheckin(selected);
    }
  };

  const handleClaimSalary = async (
    recordId: number,
    amount: string,
    period: string
  ) => {
    if (!currentAccount?.address) {
      toast({ title: "Wallet not connected", variant: "destructive" });
      return;
    }
    if (!selectedTimesheetForCheckin) {
      toast({
        title: "No Timesheet Selected",
        description: "Please select the relevant timesheet for this claim.",
        variant: "destructive",
      });
      return;
    }
    setIsClaimingSalary(true);
    try {
      console.log("TODO: Call Sui claimSalary function here with context:", {
        timesheetId: selectedTimesheetForCheckin.id,
        capId: selectedTimesheetForCheckin.capId,
        employeeAddress: currentAccount.address,
        amount,
        period,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const simulatedTxHash = `0x_sui_claim_${Math.random()
        .toString(16)
        .substring(2, 12)}`;
      console.log("Simulated SUI Tx Hash for salary claim:", simulatedTxHash);

      console.log(
        "Placeholder for backend update after Sui salary claim:",
        simulatedTxHash
      );

      queryClient.invalidateQueries({
        queryKey: [
          "/api/salary-records",
          { employeeAddress: currentAccount.address },
        ],
      });

      toast({
        title: "Salary Claim Processed (Simulated on Sui)",
        description: `Salary claim for period ${period} on timesheet ${
          selectedTimesheetForCheckin.name
        } initiated. Tx: ${simulatedTxHash.substring(0, 10)}...`,
      });
    } catch (error) {
      toast({
        title: "Error Claiming Salary",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred during claim.",
        variant: "destructive",
      });
    } finally {
      setIsClaimingSalary(false);
    }
  };

  const handleGeneralClaim = () => {
    if (!selectedTimesheetForCheckin) {
      toast({
        title: "No Timesheet Selected",
        description: "Please select a timesheet to claim salary from.",
        variant: "destructive",
      });
      return;
    }
    if (salaryRecords.length > 0) {
      const firstClaimableRecord = salaryRecords.find(
        (sr) => sr.status !== "paid"
      );
      if (firstClaimableRecord) {
        handleClaimSalary(
          firstClaimableRecord.id,
          firstClaimableRecord.amount.toString(),
          firstClaimableRecord.period
        );
      } else {
        toast({
          title: "No claimable salary found",
          description:
            "All salary records seem to be paid or unavailable for the selected timesheet.",
        });
      }
    } else {
      toast({
        title: "No salary records",
        description:
          "No salary records available to claim for the selected timesheet.",
      });
    }
  };

  const currentEarnings = {
    amount: selectedTimesheetForCheckin ? "0.125" : "0.00",
    usdValue: selectedTimesheetForCheckin ? "$312.50" : "$0.00",
    hoursWorked: selectedTimesheetForCheckin
      ? onChainWorkRecords
          .filter(
            (r: DisplayableWorkRecord) =>
              r.status === "Completed (on-chain)" && r.durationDisplay
          )
          .reduce((acc: number, r: DisplayableWorkRecord) => {
            const match = r.durationDisplay!.match(/(\d+)h (\d+)m/);
            if (match) {
              return (
                acc + (parseInt(match[1], 10) * 60 + parseInt(match[2], 10))
              );
            }
            return acc;
          }, 0) / 60 // Convert total minutes to hours, round to 2 decimal places
      : 0,
    hourlyRate: selectedTimesheetForCheckin ? "0.003" : "N/A",
  };

  const SealStatus = () => {
    if (isSealSessionInitializing) {
      return (
        <div className="flex items-center space-x-2 text-sm text-yellow-600 dark:text-yellow-400">
          <Clock className="h-4 w-4 animate-spin" />
          <span>Initializing Seal session...</span>
        </div>
      );
    }
    if (sealSessionError) {
      return (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Seal session error: {sealSessionError.substring(0, 50)}...
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={initializeSealSession}>
            Retry
          </Button>
        </div>
      );
    }
    if (sealClient && sessionKey) {
      if (sessionKey.isExpired()) {
        return (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-orange-500 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              <span>Seal session expired.</span>
            </div>
            <Button variant="outline" size="sm" onClick={initializeSealSession}>
              Refresh
            </Button>
          </div>
        );
      }
      return (
        <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span>Seal session ready.</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <HelpCircle className="h-4 w-4" />
          <span>Seal session not initialized.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={initializeSealSession}
          disabled={isSealSessionInitializing}
        >
          Initialize
        </Button>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Employee Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Track your work hours and manage salary
        </p>
        {currentAccount?.address && (
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">
            Connected: {currentAccount.address.substring(0, 10)}...
            {currentAccount.address.substring(
              currentAccount.address.length - 4
            )}
          </p>
        )}
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <SealStatus />
        </CardContent>
      </Card>

      {markerDataForAdminDisplay && (
        <Card className="mb-6 bg-blue-50 border border-blue-200">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-blue-700 mb-2">
              Work Log Data for Admin
            </h3>
            <p className="text-sm text-blue-600 mb-3">
              Please copy the following data and provide it to your
              administrator for on-chain processing.
            </p>
            <Textarea
              readOnly
              value={markerDataForAdminDisplay}
              rows={8}
              className="mb-3 font-mono text-xs bg-white border-blue-300 focus:ring-blue-500 focus:border-blue-500 text-black dark:text-black"
            />
            <div className="flex space-x-2">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      markerDataForAdminDisplay
                    );
                    toast({
                      title: "Copied!",
                      description: "Log data copied to clipboard.",
                    });
                  } catch (err) {
                    toast({
                      title: "Copy Failed",
                      description: "Could not copy to clipboard.",
                      variant: "destructive",
                    });
                    console.error("Failed to copy text: ", err);
                  }
                }}
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Copy to Clipboard
              </Button>
              <Button
                onClick={() => setMarkerDataForAdminDisplay(null)}
                variant="outline"
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <TimesheetSelector
        availableTimesheets={availableTimesheets}
        employeeSpecificTimesheets={employeeSpecificTimesheets}
        currentWalletAddress={currentAccount?.address || null}
        selectedTimesheetForCheckin={selectedTimesheetForCheckin}
        onTimesheetSelection={handleTimesheetSelection}
      />

      <Card className="mb-8 bg-card">
        <CardContent className="pt-6">
          <Tabs
            value={currentEmployeeTab}
            onValueChange={(value) => setCurrentEmployeeTab(value as any)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="workrecord"
                className="flex items-center space-x-2"
              >
                <Clock className="h-4 w-4" />
                <span>Work Record</span>
              </TabsTrigger>
              <TabsTrigger
                value="salary"
                className="flex items-center space-x-2"
              >
                <DollarSign className="h-4 w-4" />
                <span>Salary Check</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workrecord" className="mt-6">
              <div className="mb-4 p-4 border rounded-lg bg-card">
                <label
                  htmlFor="walrus-service-select"
                  className="block text-sm font-medium text-muted-foreground mb-1"
                >
                  Select Walrus Service for Log Upload:
                </label>
                <Select
                  value={selectedWalrusServiceIdForUpload}
                  onValueChange={setSelectedWalrusServiceIdForUpload}
                  disabled={WALRUS_SERVICES.length === 0}
                >
                  <SelectTrigger
                    id="walrus-service-select"
                    className="w-full md:w-[300px]"
                  >
                    <SelectValue placeholder="Choose a Walrus service..." />
                  </SelectTrigger>
                  <SelectContent>
                    {WALRUS_SERVICES.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {WALRUS_SERVICES.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    No Walrus services configured.
                  </p>
                )}
              </div>

              <WorkRecordTab
                selectedTimesheetForCheckin={selectedTimesheetForCheckin}
                isActuallyCheckedInOnChain={isActuallyCheckedInOnChain}
                currentOnChainCheckInRecord={currentOnChainCheckInRecord}
                todaysHoursOnChain={todaysHoursOnChain}
                handleCheckIn={handleCheckIn}
                handleCheckOut={handleCheckOut}
                isLoadingHistory={isLoadingHistory}
                onChainWorkRecords={onChainWorkRecords}
              />
            </TabsContent>

            <TabsContent value="salary" className="mt-6">
              <SalaryTab
                selectedTimesheetForCheckin={selectedTimesheetForCheckin}
                currentEarnings={
                  currentEarnings
                } /* This object matches CurrentEarningsDisplay */
                isClaimingSalary={isClaimingSalary}
                handleGeneralClaim={handleGeneralClaim}
                salaryRecords={
                  salaryRecords as SalaryRecordToDisplay[]
                } /* Cast if needed, or ensure types match */
                salaryLoading={salaryLoading}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Minimal definition if not already globally available
interface EmployeeCheckoutEventData {
  employee: string;
  check_in_time: string;
  check_out_time: string;
  duration: string;
}
