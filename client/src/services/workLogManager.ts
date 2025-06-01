import { SealClient } from "@mysten/seal";
// import { Transaction } from "@mysten/sui/transactions"; // No longer creating transactions here
import { fromHex, toHEX } from "@/lib/suiUtils";
import { storeBlobOnWalrus } from "./walrusService";
// import type { SuiTransactionBlockResponse } from "@mysten/sui/client"; // No longer returning this

import { ADMIN_ADDRESS } from "@/lib/constants";

// Type for the checkout event data (subset of what might be available)
interface EmployeeCheckoutEventData {
  employee: string;
  check_in_time: string;
  check_out_time: string;
  duration: string;
}

// Type for the timesheet data needed by this manager
interface TimesheetData {
  id: string;
  // capId: string; // capId is not needed here anymore as admin makes the call
  name: string;
}

interface ProcessWorkLogResult {
  blobId: string;
  sealLogId: string;
  originalWorkLogData: any; // For potential backend use
}

interface ProcessAndSubmitWorkLogParams {
  employeeEventData: EmployeeCheckoutEventData;
  timesheet: TimesheetData;
  sealClient: SealClient;
  packageId: string; // Still needed for Seal encryption context if it uses it
  encryptionThreshold: number;
  // moduleWhitelist: string; // Not needed here anymore
  // signAndExecuteTransaction: ... // Not needed here anymore
  selectedWalrusServiceId?: string;
  // currentUserAddress: string; // Not directly used for Walrus upload if sending to ADMIN_ADDRESS
}

export async function processAndSubmitWorkLog({
  employeeEventData,
  timesheet,
  sealClient,
  packageId,
  encryptionThreshold,
  // moduleWhitelist, // Removed
  // signAndExecuteTransaction, // Removed
  selectedWalrusServiceId,
}: // currentUserAddress, // Removed (using ADMIN_ADDRESS for send_object_to)
ProcessAndSubmitWorkLogParams): Promise<ProcessWorkLogResult> {
  // Changed return type
  console.log("Processing work log for Walrus upload:", {
    employeeEventData,
    timesheet,
    packageId,
    encryptionThreshold,
    selectedWalrusServiceId,
  });

  // Removed timesheet.capId check as it's not used here directly.

  const workLogData = {
    employee: employeeEventData.employee,
    date_in_ms: parseInt(employeeEventData.check_in_time),
    work_duration_ms: parseInt(employeeEventData.duration),
    timesheet_id: timesheet.id,
    timesheet_name: timesheet.name,
  };
  const workLogJsonString = JSON.stringify(workLogData);
  const workLogBytes = new TextEncoder().encode(workLogJsonString);
  console.log("Work log JSON prepared:", workLogJsonString);

  const nonce = crypto.getRandomValues(new Uint8Array(5));
  const timesheetObjectIdBytes = fromHex(timesheet.id);
  const sealLogId = toHEX(
    new Uint8Array([
      ...Array.from(timesheetObjectIdBytes),
      ...Array.from(nonce),
      ...Array.from(new TextEncoder().encode("_worklog")),
    ])
  );
  console.log(
    `Generated Seal ID for work log: ${sealLogId} using timesheet ${timesheet.id}`
  );

  const { encryptedObject: encryptedWorkLog } = await sealClient.encrypt({
    threshold: encryptionThreshold,
    packageId: packageId, // Ensure sealClient.encrypt uses packageId correctly if needed by policy
    id: sealLogId,
    data: workLogBytes,
  });
  console.log("Work log encrypted with Seal.");

  if (!encryptedWorkLog) {
    throw new Error("Failed to encrypt work log with Seal.");
  }

  console.log(
    "Attempting to store encrypted work log on Walrus...",
    `Selected Service ID: ${selectedWalrusServiceId}, SendToObject: ${ADMIN_ADDRESS}`
  );
  const { blobId } = await storeBlobOnWalrus(
    encryptedWorkLog,
    selectedWalrusServiceId,
    ADMIN_ADDRESS
  );
  console.log(`Encrypted work log stored on Walrus. Blob ID: ${blobId}`);

  // Removed add_log_marker transaction logic

  return { blobId, sealLogId, originalWorkLogData: workLogData };
}
