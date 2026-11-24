// Saves recent parsed SOL transfers for the demo address, so the page can
// show a result instantly even if the public RPC is slow or rate-limited.
// Usage: node scripts/snapshot.mjs [address] [limit]
import { writeFile } from "node:fs/promises";

const DEMO = "G5GFpTfMFPU31nmXzu5C7198RqXiVC49ToUA1h5pGyph";
const address = process.argv[2] ?? DEMO;
const limit = Number(process.argv[3] ?? 40);
const endpoints = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
const SYSTEM = "11111111111111111111111111111111";

async function rpc(method, params) {
  let last = "rpc failed";
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (res.status === 429 || res.status >= 500) {
          last = `HTTP ${res.status}`;
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
          continue;
        }
        const json = await res.json();
        if (json.error) {
          last = json.error.message;
          break;
        }
        return json.result;
      } catch (error) {
        last = error.message;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
  }
  throw new Error(last);
}

function extractTransfers(tx, addr) {
  if (!tx?.transaction) return [];
  const signature = tx.transaction.signatures?.[0];
  if (!signature) return [];
  const slot = tx.slot ?? 0;
  const blockTime = tx.blockTime ?? null;
  const out = [];
  let index = 0;
  const take = (ixs, inner) => {
    for (const ix of ixs ?? []) {
      const program = ix.programId ?? "";
      const isSystem = program === SYSTEM || ix.program === "system";
      const type = ix.parsed?.type;
      const info = ix.parsed?.info;
      if (!isSystem || (type !== "transfer" && type !== "transferChecked") || !info) continue;
      const lamports = Number(info.lamports);
      if (!Number.isFinite(lamports) || lamports <= 0) continue;
      if (info.source !== addr && info.destination !== addr) continue;
      out.push({
        signature,
        index,
        slot,
        blockTime,
        source: info.source,
        destination: info.destination,
        lamports,
        inner: Boolean(inner),
      });
      index += 1;
    }
  };
  take(tx.transaction.message?.instructions, false);
  for (const inner of tx.meta?.innerInstructions ?? []) take(inner.instructions, true);
  return out;
}

const infos = await rpc("getSignaturesForAddress", [address, { limit }]);
const transactions = [];
const transfers = [];
for (const info of infos ?? []) {
  const tx = await rpc("getTransaction", [
    info.signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" },
  ]);
  transactions.push({
    signature: info.signature,
    slot: info.slot ?? tx?.slot ?? 0,
    blockTime: info.blockTime ?? tx?.blockTime ?? null,
    err: info.err != null || tx?.meta?.err != null,
  });
  if (tx && !tx.meta?.err) transfers.push(...extractTransfers(tx, address));
  await new Promise((r) => setTimeout(r, 40));
}

const nextBefore = (infos?.length ?? 0) === limit ? (infos[infos.length - 1]?.signature ?? null) : null;
const out = { address, savedAt: new Date().toISOString(), transactions, transfers, nextBefore };
await writeFile("src/data/demo-snapshot.json", JSON.stringify(out) + "\n");
console.log(`Saved ${transactions.length} transactions and ${transfers.length} SOL transfers for ${address}`);
