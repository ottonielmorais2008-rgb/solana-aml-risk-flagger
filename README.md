# Solana AML Risk Flagger

**Live demo:** https://solana-aml-risk-flagger.vercel.app

Paste a public Solana wallet address and see whether recent native SOL transfers trigger simple, transparent heuristics: funds that arrive and leave again quickly, many small inbound payments, the same counterparty used over and over, or a sudden burst of activity. Every flag is backed by a transaction signature and links to [Solana Explorer](https://explorer.solana.com).

It is **read-only**: it only reads public blockchain data through a free public RPC. There is no wallet connection, nothing is signed, and no private keys or seed phrases are ever asked for.

The flags are patterns, not a finding of money laundering. A flagged wallet is not necessarily illicit, and a quiet wallet is not necessarily safe.

## What the flagger checks

| Flag | Rule | Severity |
| --- | --- | --- |
| Fast in/out | An inbound SOL transfer is followed, within 15 minutes, by an outbound transfer of a similar amount (at least 80% of the smaller side). | High |
| Many small inbound transfers | 5 or more inbound transfers of 0.05 SOL or less, coming from at least 3 counterparties. | Medium, or high if there are 10 or more |
| Repeated counterparty | The same address appears in 4 or more SOL transfers with the scanned wallet. | Medium |
| Burst of activity | 8 or more successful transactions in a 10-minute window. | Low, or medium if there are 15 or more |

Each flag lists the transaction signatures that support it. The principle is: every flag is backed by a transaction hash, not by "the AI said so".

The page opens on a real mainnet address whose recent public SOL transfers trigger several of these rules, so you can see results right away. A saved snapshot is shown instantly and replaced by live data as soon as the public RPC answers.

### Optional AI explanation

"Explain with AI" sends a compact, validated summary of the findings (risk level, counts, amounts, counterparties and evidence signatures — no free-form text) to a Vercel serverless function that calls Gemini (`gemini-3.5-flash-lite`). The model is told to use only that data, not to invent owners or amounts, and not to accuse anyone of a crime. The API key lives only in Vercel environment variables. Requests are rate-limited and size-capped. The explanation is optional: the flags stand on their own without it.

## Tech

- React 19, TypeScript, Vite
- Public Solana JSON-RPC (`getSignaturesForAddress` and `getTransaction`), with `https://api.mainnet-beta.solana.com` and a public fallback, retries and no API key
- Native SOL system transfers, including inner instructions
- Vercel serverless function for the optional Gemini explanation
- Vitest unit tests for the rules, the RPC parser, the API handler and UI helpers
- GitHub Actions: lint, typecheck, test and build on every push and pull request

```
src/lib/detect.ts    fast in/out, structuring, repeated counterparties, burst, overall risk
src/lib/parse.ts     system-transfer extraction from parsed transactions
src/lib/history.ts   public RPC paging, retries and concurrency
src/lib/explain.ts   /api/explain handler and Gemini call
```

## Limits

- Solana mainnet only, and only native SOL transfers (including inner instructions). SPL token transfers are not scored.
- Only the most recent transactions are scanned (40 at a time; you can load older ones). Activity outside that window is invisible.
- Wrapping SOL, validator or MEV tips, and some program flows can look like fast in/out, bursts or repeated counterparties.
- Public RPCs can be slow or rate-limited. A saved snapshot is used for the demo address when a live refresh fails.
- This is an educational tool, not a legal, compliance or security guarantee.

## Running it yourself

Requires Node.js 20.9+.

```bash
npm install
npm test
npm run dev
```

The Vite dev server also serves `/api/explain`. To try the optional explanation locally, copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The flagger works without it.

`npm run snapshot` refreshes the saved demo snapshot.

## Credits

Idea inspired by a public note on X that risk flags should be backed by a transaction hash, not by "the AI said so".

## License

[MIT](LICENSE)
