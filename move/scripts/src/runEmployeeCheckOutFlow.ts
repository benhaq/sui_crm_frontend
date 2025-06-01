import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SealClient, SessionKey, getAllowlistedKeyServers } from "@mysten/seal";
import { fromHex, toHEX } from "@mysten/bcs";
import { packageId, whitelistId, lastCheckInLogId } from "./constant"; // Assuming these are correctly defined
import { getKeypairFromBech32Priv } from "./helpers"; // Assuming this helper exists

// Replace with your employee's keypair (ensure it has SUI for gas)
const EMPLOYEE_PRIVATE_KEY =
  "suiprivkey1qpv5nc5pekayzkwwq722andx38cnnlft8th6clszxm9adtzhfmyh6t6ev0h"; // PLEASE REPLACE WITH YOUR ACTUAL KEY
const employeeKeypair = getKeypairFromBech32Priv(EMPLOYEE_PRIVATE_KEY);
const employeeAddress = employeeKeypair.getPublicKey().toSuiAddress();

// --- Configuration ---
const PACKAGE_ID = packageId;
const MODULE_WHITELIST = "whitelist";
const MODULE_EMPLOYEE_LOG = "employee_log";
const SUI_NODE_URL = getFullnodeUrl("testnet"); // Or 'devnet', 'mainnet'

const KEY_SERVER_OBJECT_IDS_TESTNET = getAllowlistedKeyServers("testnet");
const ENCRYPTION_THRESHOLD = 1; // Example: 1-out-of-N key servers

const CLOCK_OBJECT_ID = "0x6"; // Standard shared Clock object ID
// --- End Configuration ---

// Helper to create a daily ID for Seal policy (if needed for whitelist approval)
function createDailyEmployeeId(
  employeeAddr: string,
  policyObjectId: string // Typically the whitelist ID for this context
): string {
  const policyObjectBytes = fromHex(policyObjectId);
  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const encoder = new TextEncoder();
  const idData = encoder.encode(`${employeeAddr}_${dateString}_daily_access`);
  console.log(
    `Generated Seal ID for policy: ${employeeAddr}_${dateString}_daily_access`
  );
  return toHEX(new Uint8Array([...policyObjectBytes, ...idData]));
}

async function runEmployeeCheckOutFlow() {
  const suiClient = new SuiClient({ url: SUI_NODE_URL });
  const sealClient = new SealClient({
    suiClient,
    serverConfigs: KEY_SERVER_OBJECT_IDS_TESTNET.map((id) => ({
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

  let whitelistObjectId = whitelistId; // From constants
  let employeeLogSharedObjectId = lastCheckInLogId; // From constants

  if (!whitelistObjectId) {
    console.error("Whitelist ID not found in constants. Exiting.");
    return;
  }
  if (!employeeLogSharedObjectId) {
    console.error("EmployeeLastCheckInLog ID not found in constants. Exiting.");
    return;
  }

  try {
    // --- STAGE 1: Employee Daily Access Approval (using Seal for whitelist) ---
    console.log(
      "\n--- Stage 1: Employee Daily Access Validation for Checkout ---"
    );

    const sessionKey = new SessionKey({
      address: employeeAddress,
      packageId: PACKAGE_ID,
      ttlMin: 10,
      suiClient: suiClient,
    });
    const personalMessage = sessionKey.getPersonalMessage();
    console.log(
      "Please sign this message in your wallet to activate the session key for Seal:"
    );
    console.log(toHEX(personalMessage));

    const { signature: signedPersonalMessage } =
      await employeeKeypair.signPersonalMessage(personalMessage);
    sessionKey.setPersonalMessageSignature(signedPersonalMessage);
    console.log("SessionKey initialized and signed for Seal operations.");

    const employeePolicyId = createDailyEmployeeId(
      employeeAddress,
      whitelistObjectId
    );
    const dataToEncrypt = new Uint8Array([1]); // Dummy data representing "access policy"

    // Encrypt data which might be used by seal_approve if that's how whitelist works
    const { encryptedObject: dailyAccessCiphertext } = await sealClient.encrypt(
      {
        threshold: ENCRYPTION_THRESHOLD,
        packageId: PACKAGE_ID, // Assuming seal_approve is in your main package
        id: employeePolicyId,
        data: dataToEncrypt,
      }
    );
    console.log(
      "Daily access token encrypted for whitelist policy verification."
    );

    // This part assumes seal_approve is called implicitly or a capability is generated
    // that check_out's whitelist::is_member can use.
    // If seal_approve must be explicitly called before check_out, that tx would go here.
    // For simplicity, we'll assume the Seal setup above is sufficient for is_member check.
    // Constructing the txBytes for sealClient.decrypt
    const txbSealApprovalContext = new Transaction();
    const sealApproveTarget =
      `${PACKAGE_ID}::${MODULE_WHITELIST}::seal_approve` as `${string}::${string}::${string}`;
    txbSealApprovalContext.moveCall({
      target: sealApproveTarget, // This might be a dummy call just to get txBytes if seal_approve isn't explicitly needed by check_out
      arguments: [
        txbSealApprovalContext.pure.vector("u8", fromHex(employeePolicyId)),
        txbSealApprovalContext.object(whitelistObjectId),
      ],
    });
    const sealApprovalTxBytes = await txbSealApprovalContext.build({
      client: suiClient,
      onlyTransactionKind: true,
    });

    await sealClient.fetchKeys({
      ids: [employeePolicyId],
      txBytes: sealApprovalTxBytes,
      sessionKey,
      threshold: ENCRYPTION_THRESHOLD,
    });

    const decryptedPayload = await sealClient.decrypt({
      data: dailyAccessCiphertext,
      sessionKey: sessionKey,
      txBytes: sealApprovalTxBytes,
    });

    if (!(decryptedPayload && decryptedPayload[0] === 1)) {
      console.error(
        "Seal daily access verification FAILED for checkout. Whitelist check might fail."
      );
      // Decide if to proceed or exit. For now, we'll proceed and let the Move contract handle the whitelist assertion.
    } else {
      console.log(
        "Seal daily access verification successful for checkout context."
      );
    }

    // --- STAGE 2: Employee Performs Check-Out ---
    console.log("\n--- Stage 2: Employee Performing Check-Out ---");

    const txbCheckOut = new Transaction();
    const checkOutTarget =
      `${PACKAGE_ID}::${MODULE_EMPLOYEE_LOG}::check_out` as `${string}::${string}::${string}`;

    txbCheckOut.moveCall({
      target: checkOutTarget,
      arguments: [
        txbCheckOut.object(employeeLogSharedObjectId),
        txbCheckOut.object(whitelistObjectId),
        txbCheckOut.object(CLOCK_OBJECT_ID),
      ],
    });

    console.log("Submitting actual check-out transaction...");
    const checkOutResult = await suiClient.signAndExecuteTransaction({
      signer: employeeKeypair,
      transaction: txbCheckOut,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });
    console.log("Check-Out Transaction Digest:", checkOutResult.digest);

    if (checkOutResult.effects?.status?.status === "success") {
      console.log("Checkout successful!");
      const events = checkOutResult.events;
      if (events) {
        const checkOutEvent = events.find((e) =>
          e.type.includes("::EmployeeCheckOut")
        );
        if (checkOutEvent) {
          console.log(
            "EmployeeCheckOut Event Found:",
            JSON.stringify(checkOutEvent.parsedJson, null, 2)
          );
        }
      }
    } else {
      console.error("Checkout transaction failed or had errors.");
      console.error("Status:", checkOutResult.effects?.status?.error);
      if (
        (checkOutResult.effects?.status as any)?.error?.includes(
          "EAlreadyCheckedInToday"
        )
      ) {
        // This error should not happen on checkout, but as an example
      }
    }
  } catch (error) {
    console.error("Error in employee check-out flow:", error);
    if (error instanceof Error && "message" in error) {
      console.error("Error Message:", error.message);
      if ((error as any).cause) {
        console.error("Cause:", (error as any).cause);
      }
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "logs" in error &&
      (error as any).logs
    ) {
      console.error("Transaction Logs:", (error as any).logs.join("\n"));
    }
  }
}

runEmployeeCheckOutFlow();
