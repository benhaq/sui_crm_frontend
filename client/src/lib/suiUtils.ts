import { fromHex } from "@mysten/bcs";
import { Transaction } from "@mysten/sui/transactions";

export type MoveCallConstructor = (tx: Transaction, id: string) => void;

export function constructMoveCall(
  packageId: string,
  allowlistId: string
): MoveCallConstructor {
  return (tx: Transaction, id: string) => {
    tx.moveCall({
      target: `${packageId}::whitelist::seal_approve`,
      arguments: [tx.pure.vector("u8", fromHex(id)), tx.object(allowlistId)],
    });
  };
}
