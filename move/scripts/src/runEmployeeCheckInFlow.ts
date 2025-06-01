import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SealClient, SessionKey, getAllowlistedKeyServers } from "@mysten/seal"; // Ensure @mysten/seal is installed
import { fromHex, fromHEX, toHex, toHEX } from "@mysten/bcs"; // For handling hex strings if needed for IDs
import { packageId, whitelistId, lastCheckInLogId } from "./constant";
import { getKeypairFromBech32Priv } from "./helpers";

// Replace with your employee's keypair (ensure it has SUI for gas)
const EMPLOYEE_PRIVATE_KEY =
  "suiprivkey1qpv5nc5pekayzkwwq722andx38cnnlft8th6clszxm9adtzhfmyh6t6ev0h";
const employeeKeypair = getKeypairFromBech32Priv(EMPLOYEE_PRIVATE_KEY);
const employeeAddress = employeeKeypair.getPublicKey().toSuiAddress();

// --- Configuration ---
const PACKAGE_ID = packageId; // Your main package ID where employee_log and whitelist are
const MODULE_WHITELIST = "whitelist"; // Module where create_whitelist is
const MODULE_EMPLOYEE_LOG = "employee_log"; // Module with seal_approve_daily_access, check_in/out
const SUI_NODE_URL = getFullnodeUrl("testnet"); // Or 'devnet', 'mainnet'

// Mysten Labs Testnet Key Server Object IDs (replace if you use others or if these change)
// You need to find the actual Object IDs for these on Testnet.
// These are illustrative placeholders.
const KEY_SERVER_OBJECT_IDS_TESTNET = getAllowlistedKeyServers("testnet");
const ENCRYPTION_THRESHOLD = 1; // Example: 1-out-of-2 key servers needed

const CLOCK_OBJECT_ID = "0x6"; // Standard shared Clock object ID
// --- End Configuration ---

// Helper to create a daily ID for Seal policy
function createDailyEmployeeId(
  employeeAddr: string,
  policyObjectId: string
): string {
  const policyObjectBytes = fromHex(policyObjectId);

  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const encoder = new TextEncoder();
  // Combine employee address and date string for a unique daily ID
  // Using toHEX and fromHEX for consistent byte representation if needed, or just use strings
  const idData = encoder.encode(`${employeeAddr}_${dateString}_daily_access`);
  console.log(
    `Generated Seal ID for policy: ${employeeAddr}_${dateString}_daily_access`
  );
  return toHex(new Uint8Array([...policyObjectBytes, ...idData]));
}
async function runEmployeeCheckInFlow() {
  const suiClient = new SuiClient({ url: SUI_NODE_URL });
  const sealClient = new SealClient({
    suiClient,
    serverConfigs: getAllowlistedKeyServers("testnet").map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false, // Set to true in production/first setup
  });

  console.log(`Employee Address: ${employeeAddress}`);
  console.log(`Package ID: ${PACKAGE_ID}`);
  console.log(
    `Using Seal Key Servers: ${KEY_SERVER_OBJECT_IDS_TESTNET.join(", ")}`
  );

  let whitelistObjectId = whitelistId;
  let dailyAccessCiphertext: Uint8Array | undefined; // Encrypted "daily pass"
  let sessionKey: SessionKey | undefined;

  try {
    // --- STAGE 2: Employee Activates Daily Access Pass (using Seal) ---
    console.log("\n--- Stage 2: Employee Activating Daily Access Pass ---");
    if (!whitelistObjectId)
      throw new Error("Whitelist ID not found for daily pass activation.");

    sessionKey = new SessionKey({
      address: employeeAddress,
      packageId: PACKAGE_ID, // Package ID where seal_approve_daily_access is
      ttlMin: 10, // 10 minutes
      suiClient: suiClient,
    });
    const personalMessage = sessionKey.getPersonalMessage();
    console.log(
      "Please sign this message in your wallet to activate the session key for Seal:"
    );
    console.log(toHEX(personalMessage)); // Show what needs to be signed

    const { signature: signedPersonalMessage } =
      await employeeKeypair.signPersonalMessage(personalMessage);
    sessionKey.setPersonalMessageSignature(signedPersonalMessage);
    console.log("SessionKey initialized and signed.");

    const employeePolicyId = createDailyEmployeeId(
      employeeAddress,
      whitelistObjectId
    ); // Unique ID for the policy
    const dataToEncrypt = new Uint8Array([1]); // Dummy data representing "access granted"

    const { encryptedObject } = await sealClient.encrypt({
      threshold: ENCRYPTION_THRESHOLD,
      packageId: PACKAGE_ID,
      id: employeePolicyId, // The ID for the specific policy
      data: dataToEncrypt,
      // sessionKey: sessionKey, // Pass sessionKey here if encrypt also needs it for some flows, or not if encrypt is purely based on public keys.
      // The SealClient typically uses server public keys for encryption. SessionKey is mainly for decryption.
      // For encrypt, we don't need a tx or sessionKey in this context.
      // The `id` links it to the approval function.
    });
    dailyAccessCiphertext = encryptedObject;
    console.log("Daily access encrypted token created (ciphertext stored).");
    // console.log('Backup symmetric key (for disaster recovery, keep secret):', toHEX(backupKey));

    // --- STAGE 3: Employee Performs Check-In ---
    console.log("\n--- Stage 3: Employee Performing Check-In ---");
    if (!dailyAccessCiphertext)
      throw new Error("Daily access ciphertext not available.");
    if (!sessionKey) throw new Error("SessionKey not initialized.");

    // 3a. Seal Approval for Check-In
    const txbSealApproveCheckIn = new Transaction();
    const sealApproveTarget =
      `${PACKAGE_ID}::${MODULE_WHITELIST}::seal_approve` as `${string}::${string}::${string}`;
    txbSealApproveCheckIn.moveCall({
      target: sealApproveTarget,
      arguments: [
        txbSealApproveCheckIn.pure.vector("u8", fromHex(employeePolicyId)),
        txbSealApproveCheckIn.object(whitelistObjectId),
        // Add other args as defined in your seal_approve_daily_access
      ],
    });
    const sealApproveTxBytes = await txbSealApproveCheckIn.build({
      client: suiClient,
      onlyTransactionKind: true,
    });
    await sealClient.fetchKeys({
      ids: [employeePolicyId],
      txBytes: sealApproveTxBytes,
      sessionKey,
      threshold: 1,
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

      // 3b. Actual Check-In Transaction
      const txbCheckIn = new Transaction();
      const requestTarget =
        `${PACKAGE_ID}::${MODULE_EMPLOYEE_LOG}::check_in` as `${string}::${string}::${string}`;
      txbCheckIn.moveCall({
        target: requestTarget,
        arguments: [
          txbCheckIn.object(lastCheckInLogId),
          txbCheckIn.object(whitelistObjectId),
          txbCheckIn.object(CLOCK_OBJECT_ID),
        ],
      });

      console.log("Submitting actual check-in transaction...");
      const checkInResult = await suiClient.signAndExecuteTransaction({
        signer: employeeKeypair,
        transaction: txbCheckIn,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });
      console.log("Check-In Transaction Digest:", checkInResult.digest);

      // --- Read Last Check-In Info ---
      console.log(
        `\nFetching EmployeeLastCheckInLog object (ID: ${lastCheckInLogId})...`
      );
      const employeeLogObject = await suiClient.getObject({
        id: lastCheckInLogId,
        options: { showContent: true, showType: true },
      });

      if (
        employeeLogObject.data &&
        employeeLogObject.data.content &&
        employeeLogObject.data.content.dataType === "moveObject"
      ) {
        const fields = employeeLogObject.data.content.fields as any;
        // The Table object itself has an ID, nested within the EmployeeLastCheckInLog object's fields.
        // The exact path might vary slightly based on Sui SDK version and object structure.
        // common path is outer_struct.fields.table_field_name.fields.id.id
        const lastCheckInsTableId = fields.last_check_ins?.fields?.id?.id;

        if (lastCheckInsTableId) {
          console.log(
            `Extracted last_check_ins Table ID: ${lastCheckInsTableId}`
          );
          console.log(`Querying table for employee: ${employeeAddress}`);
          try {
            const checkInRecordField = await suiClient.getDynamicFieldObject({
              parentId: lastCheckInsTableId,
              name: {
                type: "address", // Assuming key type for Table<address, u64> is 'address'
                value: employeeAddress,
              },
            });

            if (
              checkInRecordField.data &&
              checkInRecordField.data.content &&
              checkInRecordField.data.content.dataType === "moveObject"
            ) {
              const recordFields = checkInRecordField.data.content
                .fields as any;
              // The value (timestamp) is typically in a field named 'value' for Table entries (DynamicField<K,V> -> struct DF {id, name, value})
              const lastCheckInTimestamp = recordFields.value;
              console.log(
                `SUCCESS: Last check-in timestamp for ${employeeAddress}: ${lastCheckInTimestamp}`
              );
              const date = new Date(parseInt(lastCheckInTimestamp)); // Parse string to number for Date constructor
              console.log(`Formatted as Date: ${date.toLocaleString()}`);
            } else {
              console.log(
                `No check-in record found for ${employeeAddress} in the table, or unexpected object structure.`
              );
              if (checkInRecordField.error)
                console.error(
                  "Error fetching dynamic field:",
                  checkInRecordField.error
                );
            }
          } catch (e) {
            console.error(
              `Error fetching dynamic field for employee ${employeeAddress} from table ${lastCheckInsTableId}:`,
              e
            );
          }
        } else {
          console.error(
            "Could not find 'last_check_ins' Table ID in EmployeeLastCheckInLog object."
          );
          console.log(
            "EmployeeLogObject fields:",
            JSON.stringify(fields, null, 2)
          );
        }
      } else {
        console.error(
          "Could not fetch or parse EmployeeLastCheckInLog object content."
        );
        if (employeeLogObject.error)
          console.error("Error fetching object:", employeeLogObject.error);
      }
      // --- End Read Last Check-In Info ---
    } else {
      console.error("Seal daily access DENIED for check-in.");
    }
  } catch (error) {
    console.error("Error in employee check-in/out flow:", error);
    if (error instanceof Error && "message" in error) {
      console.error("Error Message:", error.message);
      if ((error as any).cause) {
        console.error("Cause:", (error as any).cause);
      }
    }
    if (typeof error === "object" && error !== null && "logs" in error) {
      console.error(
        "Transaction Logs (if available from error):",
        (error as any).logs
      );
    }
  }
}

runEmployeeCheckInFlow();

// // --- STAGE 4: Employee Performs Check-Out (similar to Check-In) ---
//     // For brevity, this stage would mirror Stage 3 but call check_out.
//     // It would re-use the same dailyAccessCiphertext and active sessionKey (if within TTL).
//     // The seal_approve_daily_access would be called again.
//     console.log(
//       "\n--- Stage 4: Employee Performing Check-Out (Conceptual) ---"
//     );
//     console.log(
//       "Check-out would follow a similar pattern to check-in, using Seal for approval."
//     );
