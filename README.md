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
   "COMING SOON" to the address with a working COPY button, and the site
   starts polling the market cap from DexScreener (every 12 seconds until
   the pair is indexed, then every 30 seconds). The big counter goes
   COMING SOON → SYNCING… → live number, and the badge flips
   STANDBY → SYNCING → LIVE. Until real data arrives the dog holds a calm
   idle cruise.
2. **X_URL** — set your X link. Both X buttons (top bar and the
   "Follow the flight" pill) use it.
3. **TICKER** — change if you pick a different ticker.

## Deploy

It's a static site — `index.html` plus `images/`. Drop it on GitHub Pages,
Vercel, Netlify or any static host. No build step.
