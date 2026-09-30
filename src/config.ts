import "dotenv/config";

function num(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for env ${name}: ${raw}`);
  return n;
}

function str(name: string, def: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? def : raw.trim();
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof EFFORTS)[number];

function effort(name: string, def: ReasoningEffort): ReasoningEffort {
  const raw = str(name, def);
  if (!(EFFORTS as readonly string[]).includes(raw)) {
    throw new Error(`Invalid ${name}: ${raw} (expected one of ${EFFORTS.join(", ")})`);
  }
  return raw as ReasoningEffort;
}

export const CONFIG = {
  port: num("PORT", 3000),

  // Solana
  rpcUrl: str("RPC_URL", "https://api.mainnet-beta.solana.com"),
  // The $REASONS mint address. Empty before launch: the holder gate is then
  // disabled so the site can run in preview mode.
  mint: str("MINT", ""),
  // Secret key of the treasury wallet — the wallet that CREATED the coin on
  // pump.fun, so creator fees accrue to it. base58 string or JSON byte array.
  treasurySecretKey: str("TREASURY_SECRET_KEY", ""),

  // Round mechanics
  roundMinutes: num("ROUND_MINUTES", 30),
  // Minimum token balance (in whole tokens) required to submit. 0 = anyone.
  minHold: num("MIN_HOLD", 0),
  // SOL kept in the treasury for rent + transaction fees; never paid out.
  reserveSol: num("RESERVE_SOL", 0.05),
  // Percent of the claimable pot paid to the winner (rest rolls over).
  payoutPct: num("PAYOUT_PCT", 100),
  // Don't run a payout when the pot is below this (SOL) — rolls over instead.
  minPotSol: num("MIN_POT_SOL", 0.01),
  // Newest N entries sent to the judge (keeps the prompt bounded).
  maxEntriesJudged: num("MAX_ENTRIES_JUDGED", 200),

  // AI judge (Claude API; needs ANTHROPIC_API_KEY in the environment)
  model: str("ANTHROPIC_MODEL", "claude-opus-5-5"),
  effort: effort("ANTHROPIC_EFFORT", "high"),

  // ISO timestamp the round cycle is anchored to: verdicts land at
  // anchor + n * ROUND_MINUTES. Defaults to the $REASONS launch reset;
  // override with ROUND_ANCHOR. Empty string = epoch (:00/:30 verdicts).
  roundAnchor: str("ROUND_ANCHOR", "2026-09-30T20:54:00Z"),

  dbPath: str("DB_PATH", "data/reasons.db"),
};

export const ROUND_MS = CONFIG.roundMinutes * 60 * 1000;

export const ANCHOR_MS = (() => {
  if (!CONFIG.roundAnchor) return 0;
  const t = Date.parse(CONFIG.roundAnchor);
  if (Number.isNaN(t)) throw new Error(`Invalid ROUND_ANCHOR: ${CONFIG.roundAnchor}`);
  return t;
})();
export const LAMPORTS_PER_SOL = 1_000_000_000;
