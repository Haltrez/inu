import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { CONFIG, LAMPORTS_PER_SOL } from "./config.js";

export const connection = new Connection(CONFIG.rpcUrl, "confirmed");

export function loadTreasury(): Keypair | null {
  const raw = CONFIG.treasurySecretKey;
  if (!raw) return null;
  const bytes = raw.trim().startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : bs58.decode(raw.trim());
  return Keypair.fromSecretKey(bytes);
}

export const treasury = loadTreasury();

let mintDecimals: number | null = null;

export async function getMintDecimals(): Promise<number> {
  if (mintDecimals !== null) return mintDecimals;
  if (!CONFIG.mint) return 6;
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(CONFIG.mint));
    const data = info.value?.data;
    if (data && typeof data === "object" && "parsed" in data) {
      mintDecimals = Number(data.parsed?.info?.decimals ?? 6);
      return mintDecimals;
    }
  } catch (err) {
    console.error("[solana] failed to fetch mint decimals, assuming 6:", err);
  }
  return 6; // pump.fun default
}

/** Total raw token balance an owner holds of the $REASON mint. */
export async function tokenBalanceRaw(owner: string): Promise<bigint> {
  if (!CONFIG.mint) return 0n;
  const res = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(owner),
    { mint: new PublicKey(CONFIG.mint) },
  );
  let total = 0n;
  for (const { account } of res.value) {
    const amount: string =
      account.data.parsed?.info?.tokenAmount?.amount ?? "0";
    total += BigInt(amount);
  }
  return total;
}

/**
 * True when the wallet holds at least MIN_HOLD whole tokens. With the gate
 * at 0 the wallet must still hold a nonzero balance: only holders can ever
 * win. Pre-launch (no mint configured) everything passes for preview mode.
 */
export async function isHolder(owner: string): Promise<boolean> {
  if (!CONFIG.mint) return true;
  const decimals = await getMintDecimals();
  const required =
    CONFIG.minHold > 0
      ? BigInt(Math.round(CONFIG.minHold)) * 10n ** BigInt(decimals)
      : 1n;
  return (await tokenBalanceRaw(owner)) >= required;
}

export async function treasuryBalanceLamports(): Promise<number> {
  if (!treasury) return 0;
  return connection.getBalance(treasury.publicKey);
}

/** Lamports available for payout: balance minus the gas/rent reserve. */
export async function potLamports(): Promise<number> {
  const balance = await treasuryBalanceLamports();
  const reserve = Math.round(CONFIG.reserveSol * LAMPORTS_PER_SOL);
  return Math.max(0, balance - reserve);
}

export async function payout(to: string, lamports: number): Promise<string> {
  if (!treasury) throw new Error("treasury keypair not configured");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(to),
      lamports,
    }),
  );
  return sendAndConfirmTransaction(connection, tx, [treasury], {
    commitment: "confirmed",
  });
}

export function isValidPubkey(value: string): boolean {
  try {
    return PublicKey.isOnCurve(new PublicKey(value).toBytes());
  } catch {
    return false;
  }
}
