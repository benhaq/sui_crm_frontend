import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useWorkRecords } from "@/hooks/use-work-records";
import { useAppStore } from "@/lib/store";
import { Clock, Wallet, DollarSign } from "lucide-react";
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

// --- BEGIN Constants ---
// Ensure these are correctly set for your environment or move to networkConfig
const MODULE_WHITELIST = "whitelist";
const MODULE_EMPLOYEE_LOG = "employee_log";
const CLOCK_OBJECT_ID = "0x6"; // Standard Sui Clock object ID

const KEY_SERVER_OBJECT_IDS_TESTNET = getAllowlistedKeyServers("testnet");
const ENCRYPTION_THRESHOLD = 1; // Example: 1-out-of-N key servers

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
  // The ID for Seal is typically a hex string of the combined bytes
  const combined = new Uint8Array(policyObjectBytes.length + idData.length);
  combined.set(policyObjectBytes);
  combined.set(idData, policyObjectBytes.length);
  return toHex(combined);
}

// --- END Placeholder Constants and Helpers ---

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
  const { workRecords, checkIn, checkOut, getTodaysHours, isCheckedIn } =
    useWorkRecords(selectedTimesheetForCheckin?.id);
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
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransactionMutation } =
    useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage();
  const { mutateAsync: signTransactionMutation } = useSignTransaction();
  const packageId = useNetworkVariable("packageId");

  // Define fetchAndProcessWorkHistory using useCallback
  const fetchAndProcessWorkHistory = useCallback(async () => {
    if (!suiClient || !packageId || !currentWalletAddress) {
      setOnChainWorkRecords([]);
      return;
    }
    setIsLoadingHistory(true);
    console.log("Fetching on-chain work history for", currentWalletAddress);

    try {
      // Fetch CheckIn Events
      const checkInEventsPromise = suiClient.queryEvents({
        query: {
          MoveEventType: `${packageId}::events::EmployeeCheckInEvent`,
        },
        order: "descending",
        limit: 50,
      });

      // Fetch CheckOut Events
      const checkOutEventsPromise = suiClient.queryEvents({
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
            (event.parsedJson as any).employee === currentWalletAddress
        )
        .map(
          (event) =>
            event.parsedJson as { employee: string; check_in_time: string }
        );

      const userCheckOutEvents = checkOutEventsResponse.data
        .filter(
          (event) =>
            event.parsedJson &&
            (event.parsedJson as any).employee === currentWalletAddress
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
    suiClient,
    packageId,
    currentWalletAddress,
    toast,
    setOnChainWorkRecords,
    setIsLoadingHistory,
    setIsActuallyCheckedInOnChain,
    setCurrentOnChainCheckInRecord,
  ]); // Added all dependencies

  const employeeSpecificTimesheets = availableTimesheets.filter((ts) =>
    ts.list.includes(currentWalletAddress || "")
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
      { employeeAddress: currentWalletAddress },
    ],
    enabled: !!currentWalletAddress,
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
    if (!currentWalletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet address.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Processing Check-In...",
      description: "Please wait and approve transactions in your wallet.",
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

      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverObjectIds: KEY_SERVER_OBJECT_IDS_TESTNET.map((id) => [id, 1]),
        verifyKeyServers: false,
      });

      let dailyAccessCiphertext: Uint8Array | undefined;
      let sessionKey: SessionKey | undefined;
      const sessionKeyIdbKey = `seal-session-key-${currentWalletAddress}-${packageId}`;

      // Attempt to load existing SessionKey (no separate try-catch)
      const storedSessionData = await idbGet(sessionKeyIdbKey);

      if (
        storedSessionData &&
        storedSessionData.exportedKey &&
        storedSessionData.signature
      ) {
        console.log(
          "Found existing session key data in IndexedDB, attempting to import..."
        );
        const importedSessionKey = await SessionKey.import(
          storedSessionData.exportedKey,
          new SuiGraphQLClient({
            url: "https://sui-testnet.mystenlabs.com/graphql",
          }) as any
        );
        if (!importedSessionKey.isExpired()) {
          console.log(
            "Imported session key is not expired. Re-applying signature..."
          );
          importedSessionKey.setPersonalMessageSignature(
            storedSessionData.signature
          );
          sessionKey = importedSessionKey;
          console.log(
            "SessionKey imported and signature re-applied successfully."
          );
        } else {
          console.log(
            "Stored session key has expired or is invalid, creating a new one."
          );
          await idbDel(sessionKeyIdbKey);
        }
      }

      if (!sessionKey) {
        console.log("Creating new SessionKey as none was found or imported.");
        sessionKey = new SessionKey({
          address: currentWalletAddress,
          packageId: packageId,
          ttlMin: 30,
          client: new SuiGraphQLClient({
            url: "https://sui-testnet.mystenlabs.com/graphql",
          }) as any,
        });
        const personalMessage = sessionKey.getPersonalMessage();
        console.log(
          "Please sign this message in your wallet to activate the session key for Seal:"
        );

        const { signature: signedPersonalMessage } =
          await signPersonalMessageAsync({ message: personalMessage });
        sessionKey.setPersonalMessageSignature(signedPersonalMessage);
        console.log("New SessionKey initialized and signed.");

        // Attempt to store new SessionKey AND its signature
        await idbSet(sessionKeyIdbKey, {
          exportedKey: sessionKey.export(),
          signature: signedPersonalMessage,
        });
        console.log("New SessionKey and signature stored in IndexedDB.");
      }

      const employeePolicyId = createDailyEmployeeId(
        currentWalletAddress,
        whitelistObjectId
      );
      const dataToEncrypt = new Uint8Array([1]);

      const { encryptedObject } = await sealClient.encrypt({
        threshold: ENCRYPTION_THRESHOLD,
        packageId: packageId,
        id: employeePolicyId,
        data: dataToEncrypt,
      });
      dailyAccessCiphertext = encryptedObject;
      console.log("Daily access encrypted token created (ciphertext stored).");

      if (!dailyAccessCiphertext)
        throw new Error("Daily access ciphertext not available.");
      if (!sessionKey) throw new Error("SessionKey not initialized.");

      const txbSealApproveCheckIn = new Transaction();
      const sealApproveTarget =
        `${packageId}::${MODULE_WHITELIST}::seal_approve` as `${string}::${string}::${string}`;
      txbSealApproveCheckIn.moveCall({
        target: sealApproveTarget,
        arguments: [
          txbSealApproveCheckIn.pure.vector("u8", fromHex(employeePolicyId)),
          txbSealApproveCheckIn.object(whitelistObjectId),
        ],
      });
      const sealApproveTxBytes = await txbSealApproveCheckIn.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      console.log("Fetching keys for Seal approval...");
      await sealClient.fetchKeys({
        ids: [employeePolicyId],
        txBytes: sealApproveTxBytes,
        sessionKey,
        threshold: ENCRYPTION_THRESHOLD,
      });

      console.log(
        "Attempting Seal decryption to verify daily access for check-in..."
      );
      const decryptedPayload = await sealClient.decrypt({
        data: dailyAccessCiphertext,
        sessionKey: sessionKey,
        txBytes: sealApproveTxBytes,
      });

      if (decryptedPayload && decryptedPayload[0] === 1) {
        console.log("Seal daily access approved for check-in!");
        toast({
          title: "Seal Access Approved",
          description: "Proceeding with check-in transaction.",
        });

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
        const checkInSubmissionResult = await signAndExecuteTransactionMutation(
          {
            transaction: txbCheckIn,
          }
        );

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
          await suiClient.waitForTransaction({
            digest: checkInSubmissionResult.digest,
          });
          // Then, fetch the full transaction details
          const fullCheckInResponse = await suiClient.getTransactionBlock({
            digest: checkInSubmissionResult.digest,
            options: { showEffects: true, showEvents: true },
          });

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

            const checkInEventFromFullResponse =
              fullCheckInResponse.events?.find(
                (event: any) =>
                  event.type === `${packageId}::events::EmployeeCheckInEvent` &&
                  event.parsedJson?.employee === currentWalletAddress
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
                const eventsResult = await suiClient.queryEvents({
                  query: {
                    MoveEventType: `${packageId}::events::EmployeeCheckInEvent`,
                  },
                  order: "descending",
                  limit: 10,
                });
                const userCheckInEvent = eventsResult.data.find(
                  (event) =>
                    event.parsedJson &&
                    (event.parsedJson as any).employee === currentWalletAddress
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
              employee: currentWalletAddress!,
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
      } else {
        console.error("Seal daily access DENIED for check-in.");
        toast({
          title: "Check-In Failed",
          description: "Seal daily access was denied.",
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
    if (!currentWalletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet address.",
        variant: "destructive",
      });
      return;
    }

    // --- BEGIN On-chain Check-in Verification (keeps its own try-catch as it's a preliminary gate) ---
    toast({
      title: "Verifying Check-in Status...",
      description: "Please wait.",
    });
    try {
      console.log(
        `Fetching EmployeeLastCheckInLog object: ${EMPLOYEE_LOG_ADDRESS}`
      );
      const logObjectResponse = await suiClient.getObject({
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
        `Querying table ID ${lastCheckInsTableId} for employee: ${currentWalletAddress}`
      );
      const checkInRecordField = await suiClient.getDynamicFieldObject({
        parentId: lastCheckInsTableId,
        name: { type: "address", value: currentWalletAddress },
      });
      if (
        checkInRecordField.error ||
        !checkInRecordField.data ||
        !(checkInRecordField.data.content as any)?.fields?.value
      ) {
        console.log(
          "No active check-in record found for user:",
          currentWalletAddress,
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
        `Active check-in found. Timestamp: ${lastCheckInTimestamp}. Proceeding with checkout.`
      );
      toast({
        title: "Check-in Verified",
        description: "Proceeding with checkout process.",
      });
    } catch (e: any) {
      console.error("Error during on-chain check-in verification:", e);
      toast({
        title: "Verification Error",
        description: e.message || "Failed to verify check-in status.",
        variant: "destructive",
      });
      return;
    }
    // --- END On-chain Check-in Verification ---

    toast({
      title: "Processing Check-Out...",
      description: "Please wait and approve transactions in your wallet.",
    });

    try {
      const whitelistObjectId = selectedTimesheetForCheckin.id;
      const employeeLogSharedObjectId = EMPLOYEE_LOG_ADDRESS;

      const sealClient = new SealClient({
        suiClient: suiClient as any,
        serverObjectIds: KEY_SERVER_OBJECT_IDS_TESTNET.map((id) => [id, 1]),
        verifyKeyServers: false,
      });

      let sessionKey: SessionKey | undefined;
      const sessionKeyIdbKey = `seal-session-key-${currentWalletAddress}-${packageId}`;

      // Attempt to load existing SessionKey (no separate try-catch)
      const storedSessionData = await idbGet(sessionKeyIdbKey);

      if (
        storedSessionData &&
        storedSessionData.exportedKey &&
        storedSessionData.signature
      ) {
        console.log(
          "Found existing session key data in IndexedDB, attempting to import..."
        );
        const importedSessionKey = await SessionKey.import(
          storedSessionData.exportedKey,
          new SuiGraphQLClient({
            url: "https://sui-testnet.mystenlabs.com/graphql",
          }) as any
        );
        if (!importedSessionKey.isExpired()) {
          console.log(
            "Imported session key is not expired. Re-applying signature..."
          );
          importedSessionKey.setPersonalMessageSignature(
            storedSessionData.signature
          );
          sessionKey = importedSessionKey;
          console.log(
            "SessionKey imported and signature re-applied successfully."
          );
        } else {
          console.log(
            "Stored session key has expired or is invalid, creating a new one."
          );
          await idbDel(sessionKeyIdbKey);
        }
      }

      if (!sessionKey) {
        console.log("Creating new SessionKey for checkout.");
        sessionKey = new SessionKey({
          address: currentWalletAddress as string,
          packageId: packageId,
          ttlMin: 30,
          client: suiClient as any,
        });
        const personalMessage = sessionKey.getPersonalMessage();
        console.log(
          "Please sign this message for Seal SessionKey activation (checkout):"
        );
        const { signature: signedPersonalMessage } =
          await signPersonalMessageAsync({ message: personalMessage });
        sessionKey.setPersonalMessageSignature(signedPersonalMessage);
        console.log("New SessionKey initialized and signed for checkout.");

        // Attempt to store new SessionKey AND its signature
        await idbSet(sessionKeyIdbKey, {
          exportedKey: sessionKey.export(),
          signature: signedPersonalMessage,
        });
        console.log(
          "New SessionKey and signature stored in IndexedDB (checkout)."
        );
      }

      const employeePolicyId = createDailyEmployeeId(
        `${currentWalletAddress}`,
        whitelistObjectId
      );
      const dataToEncrypt = new Uint8Array([1]);

      const { encryptedObject: dailyAccessCiphertext } =
        await sealClient.encrypt({
          threshold: ENCRYPTION_THRESHOLD,
          packageId: packageId,
          id: employeePolicyId,
          data: dataToEncrypt,
        });
      console.log(
        "Daily access token encrypted for policy verification during checkout."
      );

      if (!dailyAccessCiphertext)
        throw new Error("Daily access ciphertext not available for checkout.");
      if (!sessionKey)
        throw new Error("SessionKey not initialized for checkout.");

      const txbSealApprovalContext = new Transaction();
      const sealApproveTarget =
        `${packageId}::${MODULE_WHITELIST}::seal_approve` as `${string}::${string}::${string}`;
      txbSealApprovalContext.moveCall({
        target: sealApproveTarget,
        arguments: [
          txbSealApprovalContext.pure.vector("u8", fromHex(employeePolicyId)),
          txbSealApprovalContext.object(whitelistObjectId),
        ],
      });
      const sealApprovalTxBytes = await txbSealApprovalContext.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      console.log("Fetching keys for Seal approval (checkout context)...");
      await sealClient.fetchKeys({
        ids: [employeePolicyId],
        txBytes: sealApprovalTxBytes,
        sessionKey,
        threshold: ENCRYPTION_THRESHOLD,
      });

      console.log("Attempting Seal decryption for checkout context...");
      const decryptedPayload = await sealClient.decrypt({
        data: dailyAccessCiphertext,
        sessionKey: sessionKey,
        txBytes: sealApprovalTxBytes,
      });

      if (!(decryptedPayload && decryptedPayload[0] === 1)) {
        console.warn(
          "Seal daily access verification FAILED for checkout. Whitelist check in Move contract might fail."
        );
        toast({
          title: "Seal Verification Note",
          description:
            "Seal access verification for checkout context did not pass. Proceeding, but contract checks might fail.",
          variant: null,
        });
      } else {
        console.log(
          "Seal daily access verification successful for checkout context."
        );
        toast({
          title: "Seal Access Approved",
          description: "Proceeding with check-out transaction.",
        });
      }

      const txbCheckOut = new Transaction();
      const checkOutTarget =
        `${packageId}::${MODULE_EMPLOYEE_LOG}::check_out` as `${string}::${string}::${string}`;
      txbCheckOut.moveCall({
        target: checkOutTarget,
        arguments: [
          txbCheckOut.object(employeeLogSharedObjectId),
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
        await suiClient.waitForTransaction({
          digest: checkOutSubmissionResult.digest,
        });
        const fullCheckOutResponse = await suiClient.getTransactionBlock({
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
                (e.parsedJson as any).employee === currentWalletAddress
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
              const eventsResult = await suiClient.queryEvents({
                query: {
                  MoveEventType: `${packageId}::events::EmployeeCheckOutEvent`,
                },
                order: "descending",
                limit: 10,
              });
              const userQueriedCheckOutEvent = eventsResult.data.find(
                (event) =>
                  event.parsedJson &&
                  (event.parsedJson as any).employee === currentWalletAddress
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
              if (!currentWalletAddress)
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
                employeeAddress: currentWalletAddress,
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
              const localMarkersKey = `my-submitted-log-markers-${currentWalletAddress}-${Date.now()}`; // Different key for employee's own records
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
    if (!currentWalletAddress) {
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
        employeeAddress: currentWalletAddress,
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
          { employeeAddress: currentWalletAddress },
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
      ? workRecords.filter((r) => r.status === "completed").length * 8.5
      : 0,
    hourlyRate: selectedTimesheetForCheckin ? "0.003" : "N/A",
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
        {currentWalletAddress && (
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">
            Connected: {currentWalletAddress.substring(0, 10)}...
            {currentWalletAddress.substring(currentWalletAddress.length - 4)}
          </p>
        )}
      </div>

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
        currentWalletAddress={currentWalletAddress}
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
