import { Transaction } from "@mysten/sui/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { packageId, whitelistCap, whitelistId } from "./constant";
import { getKeypairFromBech32Priv } from "./helpers";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const userAddresse =
  "0xe321470ee46a76f1a33d5a76ecc0f076f35f1fd1e393acad502697f453108647";
const PRIVATE_KEY =
  "suiprivkey1qqj9qawwshpgfgr53smn6swsyl9jfg2umr5ytfgavwdv690jcdvaz3k9ulu";

async function addWhitelist() {
  try {
    const keypair = getKeypairFromBech32Priv(PRIVATE_KEY);
    const txb = new Transaction();

    txb.moveCall({
      target: `${packageId}::whitelist::add`,
      arguments: [
        txb.object(whitelistId),
        txb.object(whitelistCap),
        txb.pure.address(userAddresse),
      ],
    });
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    console.log("Transaction successful!");
    console.log("Digest:", result.digest);
  } catch (error) {
    console.error("Error adding whitelist:", error);
    return null;
  }
}

addWhitelist();
