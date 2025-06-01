import { Transaction } from "@mysten/sui/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { packageId } from "./constant";
import { getKeypairFromBech32Priv } from "./helpers";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const PRIVATE_KEY =
  "suiprivkey1qqj9qawwshpgfgr53smn6swsyl9jfg2umr5ytfgavwdv690jcdvaz3k9ulu";

async function createWhitelist() {
  try {
    const keypair = getKeypairFromBech32Priv(PRIVATE_KEY);
    const txb = new Transaction();

    txb.moveCall({
      target: `${packageId}::whitelist::create_allowlist_entry`,
      arguments: [txb.pure.string("WorklogMay2025")],
    });
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    console.log("Transaction successful!");
    console.log("Digest:", result.digest);

    let createdWhitelistObjectId: string | undefined = undefined;

    if (result.objectChanges) {
      for (const change of result.objectChanges) {
        if (
          change.type === "created" &&
          change.objectType === `${packageId}::whitelist::Whitelist` &&
          change.sender === keypair.getPublicKey().toSuiAddress() // Ensures it's the object created in this tx by the sender
        ) {
          createdWhitelistObjectId = change.objectId;
          console.log(
            `Found created Whitelist object: ID: ${change.objectId}, Type: ${change.objectType}`
          );
          break; // Assuming only one Whitelist is created by this specific call by the sender
        }
      }
    }

    if (createdWhitelistObjectId) {
      console.log(
        "Successfully extracted Whitelist Object ID:",
        createdWhitelistObjectId
      );
    } else {
      console.log(
        "Could not find the created Whitelist object ID in objectChanges."
      );
      console.log(
        "Review objectChanges:",
        JSON.stringify(result.objectChanges, null, 2)
      );
      console.log("Review effects:", JSON.stringify(result.effects, null, 2));
    }
  } catch (error) {
    console.error("Error fetching credit balance:", error);
    return null;
  }
}

createWhitelist();
