import { CONFIG, LAMPORTS_PER_SOL, ROUND_MS } from "./config.js";
import * as store from "./db.js";
import { judgeRound } from "./judge.js";
import { claimCreatorFees } from "./pump.js";
import { isHolder, payout, potLamports, treasury } from "./solana.js";

export function currentRoundId(): number {
  return Math.floor(Date.now() / ROUND_MS);
}

export function roundEndsAt(roundId = currentRoundId()): number {
  return (roundId + 1) * ROUND_MS;
}

let resolving = false;

/**
 * Resolves whatever ended rounds are still open. Normally that is exactly
 * one round (the one that just ended). If the server was down across one or
 * more boundaries, only the most recently ended round pays out; the older
 * ones are marked missed and their pot simply stays in the treasury for the
 * next payout.
 */
export async function resolveEndedRounds(): Promise<void> {
  if (resolving) return;
  resolving = true;
  try {
    const open = store.unresolvedRoundsWithEntries(currentRoundId());
    if (open.length === 0) return;

    for (const missed of open.slice(0, -1)) {
      store.recordRound({
        round_id: missed,
        status: "missed",
        winner_wallet: null,
        winner_reason: null,
        justification: null,
        pot_lamports: null,
        payout_lamports: null,
        tx_sig: null,
        decided_at: Date.now(),
      });
      console.warn(`[rounds] round ${missed} missed (server was down); pot rolls over`);
    }

    await resolveRound(open[open.length - 1]);
  } catch (err) {
    console.error("[rounds] resolution failed:", err);
  } finally {
    resolving = false;
  }
}

async function resolveRound(roundId: number): Promise<void> {
  console.log(`[rounds] resolving round ${roundId}…`);

  // 1. Pull accrued creator fees into the treasury (best effort).
  await claimCreatorFees();

  // 2. Figure out the pot.
  const pot = await potLamports();
  const rolled = (why: string) => {
    store.recordRound({
      round_id: roundId,
      status: "rolled",
      winner_wallet: null,
      winner_reason: null,
      justification: null,
      pot_lamports: pot,
      payout_lamports: null,
      tx_sig: null,
      decided_at: Date.now(),
    });
    console.log(`[rounds] round ${roundId} rolled over: ${why}`);
  };

  const minPot = Math.round(CONFIG.minPotSol * LAMPORTS_PER_SOL);
  if (!treasury) return rolled("treasury keypair not configured");
  if (pot < minPot) return rolled(`pot ${pot} lamports below minimum ${minPot}`);

  // 3. Let the AI judge the entries (ids only — it never sees wallets).
  const entries = store.submissionsForRound(roundId, CONFIG.maxEntriesJudged);
  if (entries.length === 0) return rolled("no entries");

  const verdict = await judgeRound(
    entries.map((e) => ({ id: e.id, reason: e.reason })),
  );
  if (!verdict) return rolled("no verdict from judge");

  // 4. Best-ranked entry whose wallet still passes the holder gate wins.
  const byId = new Map(entries.map((e) => [e.id, e]));
  let winner: store.Submission | null = null;
  for (const id of verdict.ranking) {
    const entry = byId.get(id);
    if (!entry) continue;
    try {
      if (await isHolder(entry.wallet)) {
        winner = entry;
        break;
      }
      console.log(`[rounds] entry ${id} disqualified: no longer a holder`);
    } catch (err) {
      console.error(`[rounds] holder re-check failed for entry ${id}:`, err);
    }
  }
  if (!winner) return rolled("no ranked entry passed the holder re-check");

  // 5. Pay out.
  const payoutAmount = Math.floor((pot * CONFIG.payoutPct) / 100);
  try {
    const sig = await payout(winner.wallet, payoutAmount);
    store.recordRound({
      round_id: roundId,
      status: "paid",
      winner_wallet: winner.wallet,
      winner_reason: winner.reason,
      justification: verdict.justification,
      pot_lamports: pot,
      payout_lamports: payoutAmount,
      tx_sig: sig,
      decided_at: Date.now(),
    });
    console.log(
      `[rounds] round ${roundId} paid ${payoutAmount / LAMPORTS_PER_SOL} SOL to ${winner.wallet} (${sig})`,
    );
  } catch (err) {
    // Keep the verdict on record so the payout can be retried by hand.
    console.error(`[rounds] payout failed for round ${roundId}:`, err);
    store.recordRound({
      round_id: roundId,
      status: "failed",
      winner_wallet: winner.wallet,
      winner_reason: winner.reason,
      justification: verdict.justification,
      pot_lamports: pot,
      payout_lamports: payoutAmount,
      tx_sig: null,
      decided_at: Date.now(),
    });
  }
}

/** Fires just after every round boundary; also catches up on boot. */
export function startScheduler(): void {
  const tick = () => {
    resolveEndedRounds().finally(() => {
      const delay = roundEndsAt() - Date.now() + 5_000;
      setTimeout(tick, Math.max(delay, 5_000));
    });
  };
  tick();
}
