# Reboot

**Turn any app or piece of code into your own.**

Everyone's promised "build your own software." Almost nobody shipped it. So we did.

Describe the app you want, paste code, or point at a website. Reboot plans it, designs it and delivers a working product, with zero code from you. And it's never finished: tweak it, extend it, rebuild parts of it whenever you want. When it's ready, publish it and **launch its coin on pump.fun**.

The site has a full docs page (the **Docs** link, or `#docs`) explaining every step for users.

Any app. Any idea. Anyone can build.

## What's in here

| Path | What it is |
| --- | --- |
| `app/index.html`, `app/src/main.ts` | The site: home page, docs, the studio (chat + live preview + versions), and the coin launch dialog. |
| `app/src/prompt.ts` | Everything Reboot tells Claude: the quality bar, the blueprint format for remakes, and how requests are assembled. |
| `app/src/build.ts` | Streams plans and builds from `/api/generate` (or from Claude directly in the artifact build). |
| `app/src/presets.ts` | The starting points (apps people usually pay for). |
| `app/src/site.ts` | Cleans a website's HTML and pulls out its colors, fonts, headings and links for remaking. |
| `app/src/store.ts` | Your apps and every version of them, saved in the browser (localStorage). |
| `app/src/chain/` | Solana: wallet, pump.fun launch (`pump.ts`), IPFS uploads. Loaded only when someone launches a coin. |
| `app/api/generate.ts` | Plans, builds or changes an app with Google's free Gemini API (`app/src/gemini.ts`), or Claude if only `ANTHROPIC_API_KEY` is set. Streams the result and continues long apps across requests. |
| `app/src/ownkey.ts` | Optional: a visitor's own Claude key, called straight from their browser (never sent to the server). |
| `app/api/fetch-site.ts` | Reads a public website for remaking (private and local addresses are refused). |
| `app/api/publish.ts` | Pins an app's HTML to IPFS and returns a public link. |
| `app/api/upload.ts` | Pins the coin image and metadata to IPFS for pump.fun. |
| `app/tools/simulate-launch.ts` | Builds the exact launch transaction and simulates it on mainnet (`npm run simulate:launch`). |
| `app/tools/artifact.mjs` | Builds the single-page version that runs inside Claude (`npm run build:artifact`). |

## How it works

1. **Start.** Describe an app, tap a starting point, paste code, or enter a website address.
2. **Plan (remakes).** For code and websites, Reboot first reads the material (for a website, `api/fetch-site.ts` fetches the page, strips scripts and bulk, and extracts colors, fonts, headings and links). Claude then writes a blueprint covering screens, an exhaustive feature list, data, interactions, visual design and an original name. It shows in the chat.
3. **Build.** Claude builds a complete single-file HTML app to a strict quality bar (every control works, real empty/error states, responsive, light and dark, realistic sample data). Effort is tuned for speed: changes run at `low`, new apps and plans at `medium`, remakes at `medium` (inside Claude, everything uses the balanced model at low effort, falling back to the fast model if an answer comes back empty). Long apps that hit the limit are continued automatically.
4. **Grow it.** Each change request sends the current app plus the earlier requests, and Claude returns SEARCH/REPLACE edits that are applied in the browser (or the whole app for big changes, or if an edit doesn't match). Every result is a new version you can go back to, download, or publish to IPFS.
5. **Launch its coin.** The dialog prefills name, ticker, description and a generated image. Launching publishes the app to IPFS (it becomes the coin's website), uploads the image and metadata, then asks the creator's wallet to sign **one transaction** that creates the coin on pump.fun and, if set, makes the first buy. The wallet is the coin's creator, so pump.fun pays its creator fees to it. Reboot never holds funds or keys.

### pump.fun launch, verified on mainnet

`npm run simulate:launch -- <rpc> <firstBuySol> [longest]` builds the exact transaction the site sends and simulates it against mainnet without sending it. Results at the time of writing:

| Case | Size (limit 1,232 bytes) | Result |
| --- | --- | --- |
| Create only | 909 | succeeds |
| Create + 0.01 / 0.5 / 2 SOL first buy | 1,202 | succeeds |
| 32-character name, 10-character ticker, + first buy | 1,228 | succeeds |

Create + first buy only just fits in one transaction, so the on-chain metadata link always uses the short `ipfs.io` gateway, the priority fee is added only when it fits, and names that are too long get a clear error. Run the simulation again whenever you update `@pump-fun/pump-sdk`.

## Setup

Everything can run on free plans: a [Gemini API key](https://aistudio.google.com/apikey) (free, no card), a [Pinata](https://pinata.cloud) account, a [Helius](https://www.helius.dev) RPC URL, and [Vercel](https://vercel.com) Hobby. Node 20+ for local development.

```bash
cd app && npm install
npm run typecheck
cp .env.example .env    # fill in the values
npx vercel dev          # runs the site and the /api routes together
```

Deploy with `npx vercel deploy` (project root: `app`), setting `GEMINI_API_KEY`, `PINATA_JWT` (and optionally `PINATA_GATEWAY`), `VITE_RPC_URL` and `VITE_CLUSTER=mainnet-beta` in the Vercel project. Without `VITE_RPC_URL` everything works except coin launches.

`vercel.json` gives `api/generate.ts` 300 seconds, the most Vercel's free Hobby plan allows. Each request stops writing at about 270 seconds and the browser carries on in a new request, so long builds still finish.

## Before going public

- **Protect `/api/generate`.** Every build is billed to your Anthropic key. Add sign-in, per-user rate limits or credits (for example with Vercel KV or Upstash) before sharing the link widely. Same for `/api/upload`, `/api/publish` and your Pinata account.
- **Test a launch with a small first buy** from a fresh wallet and check the coin on pump.fun and Solscan.
- **Get legal advice.** Launching tokens, and helping others launch them, may be regulated where you or your users are.

## Known limits

- Apps are single HTML files with no backend. They can use localStorage and public, keyless APIs.
- Apps are saved per browser. Clearing site data deletes them; download or publish anything you want to keep.
- Very large apps can hit the model's output limit; ask for smaller changes at a time.
- This repo previously held **Slice** (a Solana program for splitting creator fees). It was removed and is in the git history if you need it.
