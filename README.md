# Effectively Accelerated Inu — $EAI

One-page site for the $EAI memecoin. The inu flies through space, and his
velocity is a function of market cap: the higher the MC, the faster the stars
streak, the brighter his plasma glows, the more altitude he gains.

## Launch checklist

Everything you need to edit lives in one `CONFIG` block near the top of the
`<script>` in `index.html`:

```js
const CONFIG = {
  CA: "",                        // paste the contract address here at launch
  X_URL: "https://x.com/",       // your X profile / community link
  TICKER: "$EAI",
};
```

1. **CA** — paste the contract address. The CA box switches from
   "TBA — LAUNCHING SOON" to the address with a working COPY button, and the
   site starts polling the live market cap from DexScreener every 30 seconds.
   Once live data arrives, the demo throttle slider hides itself and the
   telemetry badge flips from `SIM` to `LIVE`.
2. **X_URL** — set your X link. Both X buttons (top bar and the
   "Follow the flight" pill) use it.
3. **TICKER** — change if you pick a different ticker.

## Deploy

It's a static site — `index.html` plus `images/`. Drop it on GitHub Pages,
Vercel, Netlify or any static host. No build step.
