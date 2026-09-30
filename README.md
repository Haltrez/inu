# REASON — $REASON

**Give the AI one good reason.**

A pump.fun memecoin where 100% of creator fees go back to holders — but not
as an airdrop. Every 30 minutes, holders submit one short reason why they
deserve the pot, an AI reads all of them, picks the best one, and the pot is
sent straight to that wallet on-chain.

## How it works

```
 holders                     this server                        Solana
 ───────                     ───────────                        ──────
 connect wallet ──►  POST /api/submit
 sign + submit       · verify ed25519 signature (tweetnacl)
 a reason            · verify holder balance  ──────────────►  RPC: token accounts
                     · store in SQLite (1 per wallet/round)
                                 │
                        every 30 min (round boundary)
                                 │
                     1. claim creator fees  ────────────────►  pump.fun
                        (PumpPortal trade-local builds the      collectCreatorFee tx
                        tx, we sign locally, submit via RPC)
                     2. pot = treasury balance − gas reserve
                     3. AI judge ranks entries (Claude API,
                        structured output, entries are ids —
                        the model never sees wallets)
                     4. re-check winner still holds
                     5. SystemProgram.transfer pot ─────────►  winner's wallet
                     6. record verdict → shown on the site
```

Design decisions worth knowing:

- **Signatures, not pasted addresses.** Submitting requires signing a message
  with the wallet. Without this, anyone could enter using a whale's address
  to pass the holder gate. The signature also prevents replays (each is
  single-use, bound to wallet + round + timestamp + text).
- **The judge is injection-hardened.** Entries go to the model as pure data
  (JSON, ids only). The system prompt disqualifies manipulation attempts
  ("ignore your instructions", fake system text, etc.), the returned ids are
  validated server-side, and a refused/failed verdict just rolls the pot to
  the next round.
- **Rounds are epoch-aligned.** A round is `floor(now / 30min)`, so restarts
  don't drift and every visitor computes the same countdown. If the server
  is down across a boundary, the missed round rolls its pot forward.
- **Holder gate runs twice** — at submission and again before payout, so you
  can't submit and dump.

## Repo layout

```
src/index.ts    Express server: static site + /api/state + /api/submit
src/rounds.ts   Round engine: scheduler, resolution, payout
src/judge.ts    Claude judge (structured output, anti-manipulation prompt)
src/pump.ts     pump.fun creator-fee claim via PumpPortal trade-local
src/solana.ts   RPC, treasury keypair, holder checks, SOL transfer
src/verify.ts   Canonical message + ed25519 signature verification
src/db.ts       SQLite (better-sqlite3): submissions + round results
web/index.html  The site (no build step): countdown, pot, submit, verdicts
```

## Launch runbook

1. **Create a fresh treasury wallet.** `solana-keygen new -o treasury.json`
   (or a fresh Phantom wallet). This wallet is a hot wallet on your server —
   never reuse a personal wallet. Fund it with ~0.1 SOL for fees.
2. **Launch the coin on pump.fun from that wallet.** The creator wallet is
   what fees accrue to — it must be the treasury.
3. **Configure.** `cp .env.example .env`, set `MINT` (the new CA),
   `TREASURY_SECRET_KEY`, `ANTHROPIC_API_KEY`, and a real `RPC_URL`
   ([Helius](https://helius.dev) free tier is fine to start). Tune
   `MIN_HOLD` to taste.
4. **Run it.**
   ```bash
   npm install
   npm start          # or: npm run dev (watch mode)
   ```
5. **Deploy** anywhere that runs a long-lived Node process with a persistent
   disk for SQLite: Railway / Render / Fly.io / any VPS. (Not Vercel/Netlify
   functions — the 30-minute scheduler needs a process that stays alive.)
   Point your domain at it, set `X_URL` in the `SITE` block at the top of
   `web/index.html`, done.

## Operations

- **Preview mode:** with `MINT`/`TREASURY_SECRET_KEY` unset the site runs,
  people can connect and submit, but nothing is claimed or paid — good for
  testing the flow before launch.
- **Pot math:** pot = treasury SOL balance − `RESERVE_SOL`. Fees claimed at
  the top of each round land in the same balance. `PAYOUT_PCT` < 100 makes
  the pot compound between rounds.
- **Failed payouts** are recorded with status `failed` and the winner kept,
  so you can retry by hand. Rolled/missed rounds simply leave the SOL in the
  treasury for the next round.
- **Judge cost:** one Claude call per round (~48/day) over at most
  `MAX_ENTRIES_JUDGED` short entries — negligible next to the fees.

## Honesty corner

- The treasury is a **hot wallet**. Anyone who owns the server owns the pot.
  Keep the box boring: no other services, key only in env, consider claiming
  rewards frequently so the pot at risk stays small.
- An AI judge is a vibe, not a court. People WILL try to jailbreak it —
  that's half the content. The prompt punishes it, but expect chaos.
- Paying out community rewards may have legal/tax implications depending on
  where you live. That part is on you.
