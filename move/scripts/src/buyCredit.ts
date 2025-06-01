import { Transaction, TransactionArgument } from "@mysten/sui/transactions";
import {
  SuiClient,
  getFullnodeUrl,
  SuiEvent,
  CoinStruct,
} from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { creditTokenType, packageId, vaultObjectId } from "./constant";
import { getKeypairFromBech32Priv } from "./helpers";
import { bcs } from "@mysten/sui/bcs";

// --- Configuration ---
// IMPORTANT: Replace with your actual private key or use a secure way to load it.
const USER_PRIVATE_KEY = "suiprivkey1";
const SENDER_ADDRESS =
  "0x05d6467b14c230a7441f942d691375af659e321c7e67504a08215b603e9fdec5";
const SUI_NETWORK: "mainnet" | "testnet" | "devnet" | "localnet" = "mainnet";
const client = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });
const creditsToPurchase: bigint = 10n; // How many credits to purchase (using bigint for u64)

// Event type for CreditPurchased event
// Assuming your module is named 'vault' and event struct is 'CreditPurchased'. Adjust if different.
const CREDIT_PURCHASED_EVENT_TYPE = `${packageId}::vault::CreditPurchased`;

async function getExchangeRate(): Promise<bigint> {
  try {
    const txb = new Transaction();
    txb.moveCall({
      target: `${packageId}::vault::get_rate`,
      arguments: [txb.object(vaultObjectId)],
    });
    const result = await client.devInspectTransactionBlock({
      sender: SENDER_ADDRESS,
      transactionBlock: txb,
    });

    if (result.effects.status.status === "success") {
      const returnValues = result.results?.[0]?.returnValues;
      if (returnValues && returnValues.length > 0) {
        const [rawValue, typeTag] = returnValues[0];
        const deserializedRate = bcs.U64.parse(Uint8Array.from(rawValue));
        return BigInt(deserializedRate);
      }
    }
    console.error(
      "devInspect for getExchangeRate failed:",
      result.effects.status.error
    );
    return BigInt(0);
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    return BigInt(0);
  }
}

async function callBuyCreditFunction() {
  let keypair: Ed25519Keypair;
  try {
    keypair = getKeypairFromBech32Priv(USER_PRIVATE_KEY);
  } catch (error) {
    console.error("Failed to initialize keypair:", error);
    return;
  }
  const userAddress = keypair.getPublicKey().toSuiAddress();
  console.log(
    `Using address: ${userAddress} for transaction, on ${SUI_NETWORK} network.`
  );

  const exchangeRate = await getExchangeRate();
  if (exchangeRate <= 0n) {
    console.error("Could not fetch a valid exchange rate. Aborting purchase.");
    return;
  }
  console.log(`Fetched exchange rate: ${exchangeRate} tokens per credit.`);

  const requiredTokens = creditsToPurchase * exchangeRate;
  console.log(
    `Attempting to purchase ${creditsToPurchase} credits, requiring ${requiredTokens} tokens.`
  );

  // Fetch available coins of CREDIT_TOKEN_TYPE
  let ownedCoins: CoinStruct[];
  try {
    const { data } = await client.getCoins({
      owner: userAddress,
      coinType: creditTokenType,
    });
    ownedCoins = data;
    if (!ownedCoins || ownedCoins.length === 0) {
      console.error(
        `No coins of type '${creditTokenType}' found for address ${userAddress}.`
      );
      return;
    }
  } catch (error) {
    console.error("Error fetching payment coins:", error);
    return;
  }

  const txb = new Transaction();
  let paymentCoinArgument: TransactionArgument | string;

  // Coin selection strategy
  const suitableSingleCoin = ownedCoins.find(
    (coin) => BigInt(coin.balance) >= requiredTokens
  );

  if (suitableSingleCoin) {
    console.log(
      `Using single coin ${suitableSingleCoin.coinObjectId} with balance ${suitableSingleCoin.balance} for payment.`
    );
    // If the chosen coin has more than required, the contract will handle change.
    // We might need to split it if its balance is much larger and we want to keep the rest for other purposes,
    // but for now, we'll pass it directly as the contract handles change.
    paymentCoinArgument = txb.object(suitableSingleCoin.coinObjectId);
  } else {
    console.log("No single coin is sufficient. Attempting to merge coins.");
    ownedCoins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance))); // Sort largest first

    let collectedBalance = 0n;
    const coinsToMergeDetails: CoinStruct[] = [];
    for (const coin of ownedCoins) {
      coinsToMergeDetails.push(coin);
      collectedBalance += BigInt(coin.balance);
      if (collectedBalance >= requiredTokens) break;
    }

    if (collectedBalance < requiredTokens) {
      console.error(
        `Insufficient total balance. Have ${collectedBalance}, need ${requiredTokens} of '${creditTokenType}'.`
      );
      return;
    }

    console.log(
      `Will merge ${coinsToMergeDetails.length} coins to cover payment.`
    );
    const primaryMergeCoin = coinsToMergeDetails[0];
    const sourceMergeCoins = coinsToMergeDetails.slice(1);

    const primaryCoinArg = txb.object(primaryMergeCoin.coinObjectId);
    let mergedCoin: TransactionArgument;

    if (sourceMergeCoins.length > 0) {
      mergedCoin = txb.mergeCoins(
        primaryCoinArg,
        sourceMergeCoins.map((c) => txb.object(c.coinObjectId))
      );
    } else {
      // If only one coin was selected (it means it alone is >= requiredTokens after sorting,
      // though this case should ideally be caught by suitableSingleCoin logic, this is a safeguard)
      mergedCoin = primaryCoinArg;
    }
    paymentCoinArgument = mergedCoin;
  }

  txb.moveCall({
    target: `${packageId}::vault::buy_credit`,
    arguments: [
      txb.object(vaultObjectId),
      paymentCoinArgument,
      txb.pure.u64(creditsToPurchase),
    ],
  });

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    console.log("Transaction Digest:", result.digest);

    if (result.effects?.status.status === "success") {
      console.log("Transaction to 'buy_credit' was successful!");
      const creditEvent = result.events?.find(
        (event) => event.type === CREDIT_PURCHASED_EVENT_TYPE
      );
      if (creditEvent) {
        console.log("CreditPurchased Event Found:", creditEvent.parsedJson);
        const eventData = creditEvent.parsedJson as any;
        console.log(
          `Successfully purchased: ${eventData.credits_bought} credits for ${eventData.tokens_paid} tokens. User: ${eventData.user}, Timestamp: ${eventData.timestamp_ms}`
        );
      } else {
        console.warn(`Could not find event '${CREDIT_PURCHASED_EVENT_TYPE}'.`);
      }
    } else {
      console.error("Transaction failed:", result.effects?.status.error);
    }
  } catch (error) {
    console.error("Error executing transaction:", error);
  }
}

callBuyCreditFunction().catch((err) => {
  console.error("Unhandled error in script:", err);
});
