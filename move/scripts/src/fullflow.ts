import { fromHEX } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { packageId, whitelistId } from "./constant";
import { getKeypairFromBech32Priv } from "./helpers";
import { SessionKey } from "@mysten/seal";

const PACKAGE_ID = packageId;
const EMPLOYEE_PRIVATE_KEY =
  "suiprivkey1qpv5nc5pekayzkwwq722andx38cnnlft8th6clszxm9adtzhfmyh6t6ev0h";
const WHITELIST_ID = whitelistId;
// Helper to get current timestamp
async function getCurrentTimestamp(client: SuiClient): Promise<number> {
  const clock = await client.getObject({
    id: "0x6", // Sui's clock object
    options: { showContent: true },
  });
  return Number((clock.data as any).content.fields.timestamp_ms);
}

async function testEmployeeWorkflow() {
  // Initialize client and keypair
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const keypair = getKeypairFromBech32Priv(EMPLOYEE_PRIVATE_KEY);
  const address = keypair.getPublicKey().toSuiAddress();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::employee_log::request_check_in`,
    arguments: [tx.object(WHITELIST_ID), tx.object("0x6")],
  });
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });
  const krInId = result.effects!.created![0].reference.objectId;

  console.log("krInId", krInId);

  const sessionKey = new SessionKey({
    address: address,
    packageId: PACKAGE_ID,
    ttlMin: 24 * 60,
    suiClient: client,
  });

  //   const tx2 = new Transaction();
  //   tx2.moveCall({
  //     target: `${PACKAGE_ID}::whitelist::seal_approve`,
  //     arguments: [tx.pure(WHITELIST_ID), tx.object(krInId), tx.object("0x6")],
  //   });
  //   await client.signAndExecuteTransaction({
  //     transaction: tx2,
  //     signer: keypair, // Simulate Seal service
  //   });

  // Step 5: Employee performs check-in
  const tx5 = new Transaction();
  tx5.moveCall({
    target: `${PACKAGE_ID}::employee_log::check_in`,
    arguments: [
      tx5.object(krInId),
      tx5.object(WHITELIST_ID),
      tx5.object("0x6"),
    ],
  });
  const result5 = await client.signAndExecuteTransaction({
    transaction: tx5,
    signer: keypair,
    options: { showEffects: true },
  });
  const logId = result5.effects!.created![0].reference.objectId;

  // Simulate time passage (in reality, wait ~1 day or adjust clock if testing locally)

  // Step 6: Employee requests check-out access
  const tx6 = new Transaction();
  tx6.moveCall({
    target: `${PACKAGE_ID}::employee_log::request_check_out`,
    arguments: [tx6.object(WHITELIST_ID), tx6.object("0x6")],
  });
  const result6 = await client.signAndExecuteTransaction({
    transaction: tx6,
    signer: keypair,
    options: { showEffects: true },
  });
  const krOutId = result6.effects!.created![0].reference.objectId;

  // Step 7: Seal approves check-out request
  const tx7 = new Transaction();
  tx7.moveCall({
    target: `${PACKAGE_ID}::whitelist::seal_approve`,
    arguments: [
      tx7.object(WHITELIST_ID),
      tx7.object(krOutId),
      tx7.object("0x6"),
    ],
  });
  await client.signAndExecuteTransaction({
    transaction: tx7,
    signer: keypair,
  });

  // Step 8: Employee performs check-out
  const tx8 = new Transaction();
  tx8.moveCall({
    target: `${PACKAGE_ID}::employee_log::check_out`,
    arguments: [
      tx8.object(logId),
      tx8.object(krOutId),
      tx8.object(WHITELIST_ID),
      tx8.object("0x6"),
    ],
  });
  await client.signAndExecuteTransaction({
    transaction: tx8,
    signer: keypair,
  });

  // Step 9: Verify duration
  const log = await client.getObject({
    id: logId,
    options: { showContent: true },
  });
  const duration = Number((log.data as any).content.fields.duration);
  console.log(`Duration: ${duration} ms`);
}

testEmployeeWorkflow().catch(console.error);
