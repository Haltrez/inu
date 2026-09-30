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
  X_URL: "https://x.com/eacceleratedinu",
  LAUNCH_TS: "",                 // launch time (ISO) — set together with CA
};
```

1. **CA** — paste the contract address. The CA box switches from
   "COMING SOON" to the address with a working COPY button, and the site
   starts polling the market cap from DexScreener (every 12 seconds until
   the pair is indexed, then every 30 seconds). The big counter goes
   COMING SOON → SYNCING… → live number, and the badge flips
   STANDBY → SYNCING → LIVE. Until real data arrives everything sits at
   zero — velocity 0.0×, altitude 0 km, the dog parked with the faintest
   drift — and he eases into flight when the first live number lands.
2. **X_URL** — set your X link. Both X buttons (corner icon and the
   "Follow the flight" pill) use it.
3. **LAUNCH_TS** — set to the launch moment (ISO time). Altitude is computed
   from wall-clock time since this moment times current velocity, so every
   visitor sees the same altitude and the same milestone progress; browsers
   only smooth toward the shared number locally. The milestones rail on the
   right (desktop) lights up from the Kármán line out to Proxima Centauri
   as the shared altitude climbs.

## Deploy

It's a static site — `index.html` plus `images/`. Drop it on GitHub Pages,
Vercel, Netlify or any static host. No build step.
