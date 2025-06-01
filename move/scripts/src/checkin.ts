import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl, SuiEvent } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { packageId } from "./constant";
import { getKeypairFromBech32Priv } from "./helpers";

const EMPLOYEE_PRIVATE_KEY =
  "suiprivkey1qpv5nc5pekayzkwwq722andx38cnnlft8th6clszxm9adtzhfmyh6t6ev0h";

async function checkIn() {
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  let keypair: Ed25519Keypair;
  try {
    keypair = getKeypairFromBech32Priv(EMPLOYEE_PRIVATE_KEY);
  } catch (error) {
    console.error("Failed to initialize keypair:", error);
    return;
  }

  const userAddress = keypair.getPublicKey().toSuiAddress();

  const txb = new Transaction();

  txb.moveCall({
    target: `${packageId}::employee_log::request_check_in`,
    arguments: [txb.object(vaultObjectId)],
  });

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      options: {
        showEffects: true,
        showEvents: true, // Crucial for reading the event data
      },
    });

    console.log("Transaction Digest:", result.digest);

    if (result.effects?.status.status === "success") {
      console.log("Transaction to call 'checkin' was successful!");
    } else {
      console.error("Transaction failed:", result.effects?.status.error);
    }
  } catch (error) {
    console.error("Error executing transaction:", error);
  }
}

checkIn().catch((err) => {
  console.error("Unhandled error in script:", err);
});
