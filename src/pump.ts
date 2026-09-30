import { VersionedTransaction } from "@solana/web3.js";
import { connection, treasury } from "./solana.js";

/**
 * Claims accrued pump.fun creator fees into the treasury wallet.
 *
 * Uses PumpPortal's Local Transaction API: it builds the collectCreatorFee
 * transaction, we sign it locally with the treasury keypair (the key never
 * leaves this server) and submit it through our own RPC.
 *
 * Returns the transaction signature, or null when there was nothing to
 * claim / the claim failed. A failed claim is not fatal: the round engine
 * pays out whatever already sits in the treasury.
 */
export async function claimCreatorFees(): Promise<string | null> {
  if (!treasury) return null;
  try {
    const res = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: treasury.publicKey.toBase58(),
        action: "collectCreatorFee",
        priorityFee: 0.000001,
      }),
    });
    if (!res.ok) {
      console.error(
        `[pump] collectCreatorFee build failed: ${res.status} ${await res.text()}`,
      );
      return null;
    }
    const tx = VersionedTransaction.deserialize(
      new Uint8Array(await res.arrayBuffer()),
    );
    tx.sign([treasury]);
    const sig = await connection.sendTransaction(tx);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`[pump] creator fees claimed: ${sig}`);
    return sig;
  } catch (err) {
    console.error("[pump] collectCreatorFee failed:", err);
    return null;
  }
}
