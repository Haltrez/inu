import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

fs.mkdirSync(path.dirname(CONFIG.dbPath), { recursive: true });

const db = new Database(CONFIG.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id   INTEGER NOT NULL,
    wallet     TEXT    NOT NULL,
    reason     TEXT    NOT NULL,
    signature  TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    UNIQUE (round_id, wallet)
  );
  CREATE INDEX IF NOT EXISTS idx_submissions_round ON submissions (round_id);

  CREATE TABLE IF NOT EXISTS rounds (
    round_id        INTEGER PRIMARY KEY,
    status          TEXT    NOT NULL, -- paid | rolled | no_entries | missed | failed
    winner_wallet   TEXT,
    winner_reason   TEXT,
    justification   TEXT,
    pot_lamports    INTEGER,
    payout_lamports INTEGER,
    tx_sig          TEXT,
    decided_at      INTEGER NOT NULL
  );
`);

export interface Submission {
  id: number;
  round_id: number;
  wallet: string;
  reason: string;
  signature: string;
  created_at: number;
}

export interface RoundResult {
  round_id: number;
  status: string;
  winner_wallet: string | null;
  winner_reason: string | null;
  justification: string | null;
  pot_lamports: number | null;
  payout_lamports: number | null;
  tx_sig: string | null;
  decided_at: number;
}

const upsertSubmissionStmt = db.prepare(`
  INSERT INTO submissions (round_id, wallet, reason, signature, created_at)
  VALUES (@round_id, @wallet, @reason, @signature, @created_at)
  ON CONFLICT (round_id, wallet) DO UPDATE SET
    reason = excluded.reason,
    signature = excluded.signature,
    created_at = excluded.created_at
`);

export function upsertSubmission(s: Omit<Submission, "id">): void {
  upsertSubmissionStmt.run(s);
}

export function submissionExists(signature: string): boolean {
  return !!db
    .prepare(`SELECT 1 FROM submissions WHERE signature = ?`)
    .get(signature);
}

export function submissionsForRound(roundId: number, limit: number): Submission[] {
  return db
    .prepare(
      `SELECT * FROM submissions WHERE round_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(roundId, limit) as Submission[];
}

export function submissionCount(roundId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?`)
    .get(roundId) as { n: number };
  return row.n;
}

export function roundResolved(roundId: number): boolean {
  return !!db.prepare(`SELECT 1 FROM rounds WHERE round_id = ?`).get(roundId);
}

export function recordRound(r: RoundResult): void {
  db.prepare(`
    INSERT OR REPLACE INTO rounds
      (round_id, status, winner_wallet, winner_reason, justification,
       pot_lamports, payout_lamports, tx_sig, decided_at)
    VALUES
      (@round_id, @status, @winner_wallet, @winner_reason, @justification,
       @pot_lamports, @payout_lamports, @tx_sig, @decided_at)
  `).run(r);
}

export function recentWinners(limit: number): RoundResult[] {
  return db
    .prepare(
      `SELECT * FROM rounds WHERE status = 'paid' ORDER BY round_id DESC LIMIT ?`,
    )
    .all(limit) as RoundResult[];
}

/** Round ids that ended with submissions but were never resolved (server was down). */
export function unresolvedRoundsWithEntries(beforeRoundId: number): number[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT s.round_id FROM submissions s
         LEFT JOIN rounds r ON r.round_id = s.round_id
         WHERE r.round_id IS NULL AND s.round_id < ?
         ORDER BY s.round_id ASC`,
      )
      .all(beforeRoundId) as { round_id: number }[]
  ).map((row) => row.round_id);
}

export default db;
