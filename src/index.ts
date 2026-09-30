import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";
import * as store from "./db.js";
import { currentRoundId, roundEndsAt, startScheduler } from "./rounds.js";
import { getMintDecimals, isHolder, isValidPubkey, potLamports, treasury } from "./solana.js";
import { submissionMessage, verifySubmissionSignature } from "./verify.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "8kb" }));
app.use(express.static(path.join(here, "..", "web")));

// Naive fixed-window rate limit: 15 submissions/min per IP.
const hits = new Map<string, { n: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const slot = hits.get(ip);
  if (!slot || slot.resetAt < now) {
    hits.set(ip, { n: 1, resetAt: now + 60_000 });
    return false;
  }
  slot.n += 1;
  return slot.n > 15;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, slot] of hits) if (slot.resetAt < now) hits.delete(ip);
}, 300_000).unref();

app.get("/api/state", async (_req, res) => {
  try {
    const roundId = currentRoundId();
    const pot = await potLamports().catch(() => 0);
    res.json({
      ticker: "$REASON",
      mint: CONFIG.mint || null,
      treasury: treasury?.publicKey.toBase58() ?? null,
      roundId,
      roundEndsAt: roundEndsAt(roundId),
      roundMinutes: CONFIG.roundMinutes,
      now: Date.now(),
      potLamports: pot,
      payoutPct: CONFIG.payoutPct,
      minHold: CONFIG.minHold,
      entries: store.submissionCount(roundId),
      winners: store.recentWinners(20).map((w) => ({
        roundId: w.round_id,
        wallet: w.winner_wallet,
        reason: w.winner_reason,
        justification: w.justification,
        lamports: w.payout_lamports,
        tx: w.tx_sig,
        at: w.decided_at,
      })),
    });
  } catch (err) {
    console.error("[api] /api/state failed:", err);
    res.status(500).json({ error: "state_failed" });
  }
});

app.post("/api/submit", async (req, res) => {
  try {
    if (rateLimited(req.ip ?? "unknown")) {
      return res.status(429).json({ error: "Slow down — try again in a minute." });
    }

    const { wallet, reason, roundId, ts, signature } = (req.body ?? {}) as {
      wallet?: unknown;
      reason?: unknown;
      roundId?: unknown;
      ts?: unknown;
      signature?: unknown;
    };

    if (typeof wallet !== "string" || !isValidPubkey(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address." });
    }
    if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 280) {
      return res.status(400).json({ error: "Reason must be 3–280 characters." });
    }
    if (typeof signature !== "string" || signature.length > 200) {
      return res.status(400).json({ error: "Missing signature." });
    }
    if (typeof ts !== "number" || Math.abs(Date.now() / 1000 - ts) > 600) {
      return res.status(400).json({ error: "Stale timestamp — refresh and try again." });
    }

    const current = currentRoundId();
    if (roundId !== current) {
      // The round flipped between the client fetching state and signing.
      return res.status(409).json({ error: "round_flipped", roundId: current });
    }

    if (store.submissionExists(signature)) {
      return res.status(409).json({ error: "This signature was already used." });
    }

    const message = submissionMessage(wallet, current, ts, reason);
    if (!verifySubmissionSignature(wallet, message, signature)) {
      return res.status(401).json({ error: "Signature check failed." });
    }

    if (!(await isHolder(wallet))) {
      return res.status(403).json({
        error: `You need to hold at least ${CONFIG.minHold.toLocaleString("en-US")} $REASON to enter.`,
      });
    }

    store.upsertSubmission({
      round_id: current,
      wallet,
      reason,
      signature,
      created_at: Date.now(),
    });

    res.json({ ok: true, roundId: current, endsAt: roundEndsAt(current) });
  } catch (err) {
    console.error("[api] /api/submit failed:", err);
    res.status(500).json({ error: "Something broke — try again." });
  }
});

async function boot() {
  console.log("REASON server starting…");
  if (!treasury) {
    console.warn(
      "[boot] TREASURY_SECRET_KEY not set — preview mode: no fee claims, no payouts.",
    );
  } else {
    console.log(`[boot] treasury: ${treasury.publicKey.toBase58()}`);
  }
  if (!CONFIG.mint) {
    console.warn("[boot] MINT not set — holder gate disabled (pre-launch mode).");
  } else {
    console.log(`[boot] mint: ${CONFIG.mint} (decimals ${await getMintDecimals()})`);
  }
  console.log(
    `[boot] rounds every ${CONFIG.roundMinutes} min, payout ${CONFIG.payoutPct}% of pot, reserve ${CONFIG.reserveSol} SOL`,
  );

  startScheduler();
  app.listen(CONFIG.port, () => {
    console.log(`[boot] listening on http://localhost:${CONFIG.port}`);
  });
}

boot().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
