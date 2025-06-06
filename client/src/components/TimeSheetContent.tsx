import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  useSuiClient,
  useCurrentAccount,
  useSignPersonalMessage,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "@/networkConfig";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Eye,
  ArrowLeft,
  Download,
  Key,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  ClipboardPaste,
  User,
} from "lucide-react";
import {
  SealClient,
  SessionKey,
  getAllowlistedKeyServers,
  NoAccessError,
  EncryptedObject,
} from "@mysten/seal";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { set as idbSet, get as idbGet, del as idbDel } from "idb-keyval";
import { WALRUS_SERVICES } from "@/services/walrusService";
import { fromHex, toHex } from "@mysten/bcs";
import { Textarea } from "@/components/ui/textarea";
import { constructMoveCall } from "@/lib/suiUtils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Types
interface TimesheetInfo {
  id: string;
  name: string;
  list: string[];
}

interface DecryptionResult {
  url?: string;
  error?: string;
  data?: any;
  type?: string;
  rawDecrypted?: Uint8Array;
  downloadTime?: number;
  decryptTime?: number;
}

// Add a new interface for blob with seal log ID
interface BlobWithSealId {
  blobId: string;
  sealLogId?: string;
}

export default function TimeSheetContent() {
  const { id: timesheetId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Sui hooks
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage();
  const packageId = useNetworkVariable("packageId");

  // State
  const [timesheetInfo, setTimesheetInfo] = useState<TimesheetInfo | null>(
    null
  );
  const [isLoadingTimesheet, setIsLoadingTimesheet] = useState(true);
  const [onChainBlobIds, setOnChainBlobIds] = useState<string[]>([]);
  const [isLoadingWorkLogMarkers, setIsLoadingWorkLogMarkers] = useState(false);
  const [decryptionResults, setDecryptionResults] = useState<
    Record<string, DecryptionResult>
  >({});
  const [isDecrypting, setIsDecrypting] = useState<string | null>(null);

  // Admin Seal Client and Session Key state
  const [sealClientForAdmin, setSealClientForAdmin] =
    useState<SealClient | null>(null);
  const [sessionKeyForAdmin, setSessionKeyForAdmin] =
    useState<SessionKey | null>(null);
  const [isInitializingSealAdmin, setIsInitializingSealAdmin] = useState(false);
  const [adminSealError, setAdminSealError] = useState<string | null>(null);

  // State for manual marker input
  const [markerInputText, setMarkerInputText] = useState("");
  const [processedMarkers, setProcessedMarkers] = useState<
    Array<{ blobId: string; sealLogId: string; employeeAddress?: string }>
  >([]);

  const KEY_SERVER_OBJECT_IDS_TESTNET = getAllowlistedKeyServers("testnet");
  const ENCRYPTION_THRESHOLD_FOR_DECRYPT = 2;

  // Initialize Admin Seal Session
  const initializeAdminSealSession = async () => {
    if (!currentAccount?.address || !packageId || !suiClient) {
      setAdminSealError(
        "Wallet not connected, packageId missing, or Sui client not available."
      );
      return;
    }

    console.log("TimeSheet: Starting Seal initialization...");
    setIsInitializingSealAdmin(true);
    setAdminSealError(null);

    try {
      const client = new SealClient({
        suiClient: suiClient as any,
        serverConfigs: KEY_SERVER_OBJECT_IDS_TESTNET.map((id) => ({
          objectId: id,
          weight: 1,
        })),
        verifyKeyServers: false,
      });
      setSealClientForAdmin(client);

      const sessionKeyIdbKey = `seal-session-key-admin-${currentAccount.address}-${packageId}-${timesheetId}`;
      const storedSessionData = await idbGet(sessionKeyIdbKey);

      let sk: SessionKey | undefined;

      if (
        storedSessionData &&
        storedSessionData.exportedKey &&
        storedSessionData.signature
      ) {
        console.log("TimeSheet: Found existing session key in IndexedDB...");
        const importedSk = await SessionKey.import(
          storedSessionData.exportedKey,
          new SuiClient({ url: getFullnodeUrl("testnet") })
        );
        if (
          !importedSk.isExpired() ||
          importedSk.getAddress() !== currentAccount.address
        ) {
          importedSk.setPersonalMessageSignature(storedSessionData.signature);
          sk = importedSk;
          console.log("TimeSheet: SessionKey imported successfully.");
        } else {
          console.log(
            "TimeSheet: Stored session key expired, creating new one."
          );
          await idbDel(sessionKeyIdbKey);
        }
      }

      if (!sk) {
        console.log("TimeSheet: Creating new SessionKey...");
        sk = new SessionKey({
          address: currentAccount.address,
          packageId: packageId,
          ttlMin: 30,
          suiClient: new SuiClient({ url: getFullnodeUrl("testnet") }),
        });

        const personalMessage = sk.getPersonalMessage();
        toast({
          title: "Seal Setup",
          description:
            "Please sign the message in your wallet to activate Seal session key.",
          duration: 7000,
        });

        const { signature: signedPersonalMessage } =
          await signPersonalMessageAsync({ message: personalMessage });

        sk.setPersonalMessageSignature(signedPersonalMessage);
        await idbSet(sessionKeyIdbKey, {
          exportedKey: sk.export(),
          signature: signedPersonalMessage,
        });
      }

      setSessionKeyForAdmin(sk);
      toast({
        title: "Seal Ready",
        description: "Seal client and session key initialized.",
        variant: "default",
      });
    } catch (error: any) {
      console.error("TimeSheet: Error initializing Seal session:", error);
      setAdminSealError(error.message || "Failed to initialize Seal session.");
      toast({
        title: "Seal Error",
        description: error.message || "Failed to initialize Seal.",
        variant: "destructive",
      });
    } finally {
      setIsInitializingSealAdmin(false);
    }
  };

  // Fetch timesheet info
  useEffect(() => {
    const fetchTimesheetInfo = async () => {
      if (!timesheetId || !suiClient) return;

      setIsLoadingTimesheet(true);
      try {
        const response = await suiClient.getObject({
          id: timesheetId,
          options: { showContent: true, showType: true },
        });

        if (response.data?.content) {
          const fields = (response.data.content as any)?.fields;
          if (fields) {
            setTimesheetInfo({
              id: timesheetId,
              name: fields.name || "Unknown Timesheet",
              list: fields.list || [],
            });
          }
        }
      } catch (error) {
        console.error("Error fetching timesheet info:", error);
        toast({
          title: "Error",
          description: "Failed to load timesheet information.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingTimesheet(false);
      }
    };

    fetchTimesheetInfo();
  }, [timesheetId, suiClient, toast]);

  // Fetch work log markers (blobIds)
  useEffect(() => {
    const fetchWorkLogBlobIds = async () => {
      if (!timesheetId || !suiClient) {
        setOnChainBlobIds([]);
        return;
      }

      setIsLoadingWorkLogMarkers(true);
      setOnChainBlobIds([]);
      setDecryptionResults({});

      console.log(
        `Fetching dynamic field names (blobIds) for timesheet: ${timesheetId}`
      );

      try {
        const dynamicFieldsResponse = await suiClient.getDynamicFields({
          parentId: timesheetId,
        });

        console.log("Raw dynamic fields response:", dynamicFieldsResponse.data);

        const fetchedBlobIds = dynamicFieldsResponse.data
          .map((df) => {
            console.log("Processing dynamic field:", df);
            console.log("Field name type:", df.name?.type);
            console.log("Field name value:", df.name?.value);

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

        console.log("Fetched blob IDs:", fetchedBlobIds);
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

    fetchWorkLogBlobIds();
  }, [timesheetId, suiClient, toast]);

  // Handle decrypt work log
  const handleDecryptWorkLog = async (
    blobId: string,
    providedSealLogId?: string
  ) => {
    if (
      !sealClientForAdmin ||
      !sessionKeyForAdmin ||
      !timesheetId ||
      !packageId ||
      !suiClient
    ) {
      toast({
        title: "Prerequisites Missing",
        description:
          "Seal session not ready, timesheet not selected, or client/packageId missing.",
        variant: "destructive",
      });
      return;
    }

    if (sessionKeyForAdmin.isExpired()) {
      toast({
        title: "Session Expired",
        description: "Seal session key has expired. Please re-initialize.",
        variant: "destructive",
      });
      return;
    }

    setIsDecrypting(blobId);
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

    const downloadStartTime = Date.now();
    let downloadedArrayBuffer: ArrayBuffer | null = null;

    try {
      // 1. Download from Walrus
      if (WALRUS_SERVICES.length === 0) {
        throw new Error("No Walrus services configured for download.");
      }

      const selectedService = WALRUS_SERVICES[0];
      let baseUrl = selectedService.aggregatorUrl;
      baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      let walrusDownloadUrl = `${baseUrl}/v1/blobs/${blobId}`;

      console.log("Downloading from Walrus aggregator:", walrusDownloadUrl);
      console.log("Raw blob ID:", blobId);
      console.log("Aggregator service:", selectedService);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Try to verify if blob exists first with a HEAD request
      try {
        const headResponse = await fetch(walrusDownloadUrl, {
          method: "HEAD",
          signal: controller.signal,
        });
        console.log("HEAD request status:", headResponse.status);
        if (!headResponse.ok && headResponse.status === 404) {
          // Try URL encoding the blob ID if it contains special characters
          const encodedBlobId = encodeURIComponent(blobId);
          if (encodedBlobId !== blobId) {
            console.log("Trying with URL-encoded blob ID:", encodedBlobId);
            const encodedUrl = `${baseUrl}/v1/blobs/${encodedBlobId}`;
            const encodedHeadResponse = await fetch(encodedUrl, {
              method: "HEAD",
              signal: controller.signal,
            });
            if (encodedHeadResponse.ok) {
              console.log("URL-encoded blob ID worked!");
              walrusDownloadUrl = encodedUrl;
            }
          }
        }
      } catch (headError) {
        console.warn("HEAD request failed, proceeding with GET:", headError);
      }

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
      const downloadTime = Date.now() - downloadStartTime;
      console.log(
        `Blob ${blobId} downloaded successfully (${downloadedArrayBuffer.byteLength} bytes) in ${downloadTime}ms`
      );

      // 2. Parse Encrypted Object to get the fullSealPolicyId
      if (!downloadedArrayBuffer) throw new Error("Downloaded data is null.");
      const encryptedBlobBytes = new Uint8Array(downloadedArrayBuffer);

      let fullSealPolicyId: string;
      if (providedSealLogId) {
        // Use the provided seal log ID from the marker
        fullSealPolicyId = providedSealLogId;
        console.log(`Using provided sealLogId: ${fullSealPolicyId}`);
      } else {
        // Fall back to parsing from encrypted object
        const parsedEncryptedObject = EncryptedObject.parse(encryptedBlobBytes);
        fullSealPolicyId = parsedEncryptedObject.id;
        console.log(
          `Parsed fullSealPolicyId from encrypted object: ${fullSealPolicyId}`
        );
      }

      // 3. Construct Transaction for seal_approve
      const tx = new Transaction();

      const sealApproveTxConstructor = constructMoveCall(
        packageId,
        timesheetId
      );
      sealApproveTxConstructor(tx, fullSealPolicyId);

      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      const decryptStartTime = Date.now();

      // 5. Seal SDK fetchKeys
      console.log("Fetching keys for Seal decryption...");
      await sealClientForAdmin.fetchKeys({
        ids: [fullSealPolicyId],
        txBytes,
        sessionKey: sessionKeyForAdmin,
        threshold: ENCRYPTION_THRESHOLD_FOR_DECRYPT,
      });

      // 6. Seal SDK decrypt
      console.log("Decrypting blob data...");
      const decryptedDataArray = await sealClientForAdmin.decrypt({
        data: encryptedBlobBytes,
        sessionKey: sessionKeyForAdmin,
        txBytes,
      });
      const decryptTime = Date.now() - decryptStartTime;
      console.log(
        `Data decrypted successfully (${decryptedDataArray.byteLength} bytes) in ${decryptTime}ms`
      );

      // 7. Process Decrypted Data
      setDecryptionResults((prev) => ({
        ...prev,
        [blobId]: {
          rawDecrypted: decryptedDataArray,
          downloadTime,
          decryptTime,
        },
      }));

      // Try to parse as JSON
      try {
        const decodedText = new TextDecoder().decode(decryptedDataArray);
        const jsonData = JSON.parse(decodedText);
        setDecryptionResults((prev) => ({
          ...prev,
          [blobId]: {
            ...prev[blobId],
            data: jsonData,
            type: "json",
          },
        }));
        toast({
          title: "Decryption Successful",
          description: `Blob ${blobId} content decrypted (JSON).`,
        });
      } catch (jsonError) {
        // Try to display as image
        try {
          const imageBlob = new Blob([decryptedDataArray], {
            type: "image/jpeg",
          });
          const imageUrl = URL.createObjectURL(imageBlob);
          setDecryptionResults((prev) => ({
            ...prev,
            [blobId]: {
              ...prev[blobId],
              url: imageUrl,
              type: "image",
            },
          }));
          toast({
            title: "Decryption Successful",
            description: `Blob ${blobId} content decrypted (Image).`,
          });
        } catch (imageError) {
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

  // Process pasted marker data
  const handleProcessMarkerData = () => {
    if (!markerInputText.trim()) {
      toast({
        title: "No Input",
        description: "Please paste the marker data from the employee.",
        variant: "destructive",
      });
      return;
    }

    try {
      const parsedData = JSON.parse(markerInputText);
      const markers = Array.isArray(parsedData) ? parsedData : [parsedData];

      const validMarkers = markers.filter((m) => m.blobId && m.sealLogId);

      if (validMarkers.length === 0) {
        toast({
          title: "Invalid Data",
          description:
            "No valid markers found. Each marker needs blobId and sealLogId.",
          variant: "destructive",
        });
        return;
      }

      setProcessedMarkers(validMarkers);
      setMarkerInputText("");
      toast({
        title: "Markers Processed",
        description: `${validMarkers.length} marker(s) loaded successfully.`,
      });
    } catch (e) {
      toast({
        title: "Parse Error",
        description:
          "Invalid JSON format. Please check the data and try again.",
        variant: "destructive",
      });
    }
  };

  // Group logs by employee address for rendering
  const groupedLogs = useMemo(() => {
    const allLogs: Array<{
      blobId: string;
      sealLogId?: string;
      employeeAddress: string;
    }> = [];

    // Add processed markers, which have an employee address
    processedMarkers.forEach((marker) => {
      allLogs.push({
        blobId: marker.blobId,
        sealLogId: marker.sealLogId,
        employeeAddress: marker.employeeAddress || "Unidentified",
      });
    });

    // Add on-chain blobs that aren't already in the processed list
    // These will be grouped under "Unidentified" until decrypted
    const processedBlobIds = new Set(processedMarkers.map((m) => m.blobId));
    onChainBlobIds.forEach((blobId) => {
      if (!processedBlobIds.has(blobId)) {
        allLogs.push({
          blobId: blobId,
          employeeAddress: "Unidentified On-Chain Logs",
        });
      }
    });

    // Group all logs by employee address
    return allLogs.reduce(
      (
        acc,
        log
      ): Record<
        string,
        Array<{ blobId: string; sealLogId?: string; employeeAddress: string }>
      > => {
        const key = log.employeeAddress;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(log);
        return acc;
      },
      {} as Record<
        string,
        Array<{ blobId: string; sealLogId?: string; employeeAddress: string }>
      >
    );
  }, [processedMarkers, onChainBlobIds]);

  if (!timesheetId) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No timesheet ID provided in the URL.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header with back button */}
      <div className="mb-6 flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/admin")}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Admin</span>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-white">Timesheet Details</h1>
          <p className="text-gray-600 dark:text-gray-300">
            View and decrypt work log entries
          </p>
        </div>
      </div>

      {/* Timesheet Info Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Timesheet Information</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingTimesheet ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading timesheet info...</span>
            </div>
          ) : timesheetInfo ? (
            (() => {
              // Logic to separate admin from employees
              const adminAddress = currentAccount?.address;
              const isAdminInList =
                adminAddress && timesheetInfo.list.includes(adminAddress);
              const employeeList = adminAddress
                ? timesheetInfo.list.filter((addr) => addr !== adminAddress)
                : timesheetInfo.list;

              return (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Name:
                    </label>
                    <p className="text-lg font-semibold">
                      {timesheetInfo.name}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      ID:
                    </label>
                    <p className="font-mono text-sm">{timesheetInfo.id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Employee Count:
                    </label>
                    <p>{employeeList.length} employee(s)</p>
                  </div>
                  {(isAdminInList || employeeList.length > 0) && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Participants:
                      </label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {isAdminInList && (
                          <Badge
                            variant="default"
                            className="font-mono text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Admin: {adminAddress.substring(0, 8)}...
                            {adminAddress.substring(adminAddress.length - 6)}
                          </Badge>
                        )}
                        {employeeList.map((address, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            {address.substring(0, 8)}...
                            {address.substring(address.length - 6)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <p className="text-muted-foreground">
              Failed to load timesheet information.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Seal Setup Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>Seal Decryption Setup</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!sealClientForAdmin || !sessionKeyForAdmin ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Initialize Seal session to decrypt work log entries.
              </p>
              <Button
                onClick={initializeAdminSealSession}
                disabled={isInitializingSealAdmin || !currentAccount?.address}
                className="flex items-center space-x-2"
              >
                {isInitializingSealAdmin ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Key className="h-4 w-4" />
                )}
                <span>
                  {isInitializingSealAdmin
                    ? "Initializing..."
                    : "Initialize Seal Session"}
                </span>
              </Button>
              {adminSealError && (
                <div className="flex items-center space-x-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{adminSealError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-green-600">
              <Key className="h-4 w-4" />
              <span>Seal session is ready for decryption</span>
              {sessionKeyForAdmin.isExpired() && (
                <Badge variant="destructive">Expired</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Marker Input Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ClipboardPaste className="h-5 w-5" />
            <span>Process Employee Log Markers</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Paste the log marker data provided by employees after checkout:
              </p>
              <Textarea
                value={markerInputText}
                onChange={(e) => setMarkerInputText(e.target.value)}
                placeholder='{"blobId": "...", "sealLogId": "...", "employeeAddress": "...", ...}'
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <Button onClick={handleProcessMarkerData} className="w-full">
              <ClipboardPaste className="h-4 w-4 mr-2" />
              Process Marker Data
            </Button>
            {processedMarkers.length > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">
                  Processed Markers ({processedMarkers.length}):
                </p>
                <div className="space-y-1">
                  {processedMarkers.map((marker, index) => (
                    <div key={index} className="text-xs">
                      <span className="font-mono">
                        {marker.blobId.substring(0, 8)}...
                      </span>
                      {marker.employeeAddress && (
                        <span className="text-muted-foreground ml-2">
                          ({marker.employeeAddress.substring(0, 6)}...)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Work Log Entries Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Work Log Entries</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingWorkLogMarkers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading blob IDs...</span>
            </div>
          ) : onChainBlobIds.length === 0 && processedMarkers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No work log entries found. Either load from on-chain or paste
              employee markers above.
            </p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {Object.entries(groupedLogs).map(([employeeAddress, logs]) => (
                <AccordionItem key={employeeAddress} value={employeeAddress}>
                  <AccordionTrigger>
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4" />
                      <span className="font-mono text-sm">
                        {employeeAddress}
                      </span>
                      <Badge variant="outline">{logs.length} log(s)</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2 pl-6">
                      {logs.map((log) => (
                        <div
                          key={log.blobId}
                          className="border-l-2 pl-4 border-dashed"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 overflow-hidden">
                              <p className="font-semibold flex items-center space-x-2">
                                <Download className="h-4 w-4" />
                                <span>Blob ID:</span>
                              </p>
                              <p className="font-mono text-xs text-muted-foreground break-all">
                                {log.blobId}
                              </p>
                              {log.sealLogId && (
                                <p className="text-xs text-green-600 mt-1">
                                  ✓ Has Seal Log ID for decryption
                                </p>
                              )}
                              {decryptionResults[log.blobId]?.downloadTime && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Download:{" "}
                                  {decryptionResults[log.blobId].downloadTime}
                                  ms | Decrypt:{" "}
                                  {decryptionResults[log.blobId].decryptTime}ms
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() =>
                                handleDecryptWorkLog(log.blobId, log.sealLogId)
                              }
                              disabled={
                                isDecrypting === log.blobId ||
                                !sealClientForAdmin ||
                                !sessionKeyForAdmin ||
                                sessionKeyForAdmin.isExpired()
                              }
                              className="ml-4 flex-shrink-0"
                            >
                              {isDecrypting === log.blobId ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Key className="h-4 w-4 mr-2" />
                              )}
                              {isDecrypting === log.blobId
                                ? "Decrypting..."
                                : decryptionResults[log.blobId]?.url ||
                                  decryptionResults[log.blobId]?.data
                                ? "View Again"
                                : "Decrypt & View"}
                            </Button>
                          </div>

                          {/* Display links/decrypted data */}
                          {employeeAddress === "Unidentified On-Chain Logs" && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              <p>If download fails, verify the blob exists:</p>
                              <div className="space-y-1 mt-1">
                                <a
                                  href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${log.blobId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:underline block"
                                >
                                  → Check on Aggregator (direct)
                                </a>
                                <a
                                  href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${encodeURIComponent(
                                    log.blobId
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:underline block"
                                >
                                  → Check on Aggregator (URL encoded)
                                </a>
                              </div>
                            </div>
                          )}

                          {decryptionResults[log.blobId]?.url &&
                            decryptionResults[log.blobId]?.type === "image" && (
                              <div className="mt-3">
                                <div className="flex items-center space-x-2 mb-2">
                                  <ImageIcon className="h-4 w-4" />
                                  <p className="text-sm font-medium">
                                    Decrypted Image:
                                  </p>
                                </div>
                                <img
                                  src={decryptionResults[log.blobId]?.url}
                                  alt={`Decrypted content for ${log.blobId}`}
                                  className="rounded-md border max-w-xs max-h-64 object-contain"
                                />
                              </div>
                            )}
                          {decryptionResults[log.blobId]?.data &&
                            decryptionResults[log.blobId]?.type === "json" && (
                              <div className="mt-3">
                                <div className="flex items-center space-x-2 mb-2">
                                  <FileText className="h-4 w-4" />
                                  <p className="text-sm font-medium">
                                    Decrypted Data (JSON):
                                  </p>
                                </div>
                                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64">
                                  {JSON.stringify(
                                    decryptionResults[log.blobId]?.data,
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            )}
                          {decryptionResults[log.blobId]?.error && (
                            <div className="mt-3 flex items-center space-x-2 text-destructive">
                              <AlertCircle className="h-4 w-4" />
                              <p className="text-sm">
                                Error: {decryptionResults[log.blobId]?.error}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
