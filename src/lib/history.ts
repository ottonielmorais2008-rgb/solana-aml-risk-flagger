import { DEFAULT_ENDPOINTS, rpcRequest, type FetchLike } from "./rpc.js";
import { extractTransfers, txFromParsed, txFromSignature, type ParsedTransaction, type SignatureInfo } from "./parse.js";
import type { HistoryPage, SolTransfer, WalletTx } from "./types.js";

export const DEFAULT_SIGNATURE_LIMIT = 40;
export const TX_CONCURRENCY = 3;
export const TX_OPTIONS = { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" } as const;

export interface LoadOptions {
  limit?: number;
  before?: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  endpoints?: readonly string[];
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function loadHistory(address: string, options: LoadOptions = {}): Promise<HistoryPage> {
  const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
  const limit = options.limit ?? DEFAULT_SIGNATURE_LIMIT;
  const rpcOpts = { fetch: options.fetch, sleep: options.sleep, retries: options.retries };
  const params: unknown[] = options.before
    ? [address, { limit, before: options.before }]
    : [address, { limit }];

  const signatures = await rpcRequest<SignatureInfo[]>(endpoints, "getSignaturesForAddress", params, rpcOpts);
  if (!signatures.ok) {
    throw new Error(signatures.error.message);
  }
  const infos = signatures.value ?? [];
  const nextBefore = infos.length === limit ? (infos[infos.length - 1]?.signature ?? null) : null;

  const parsed = await mapPool(infos, options.concurrency ?? TX_CONCURRENCY, async (info) => {
    if (!info.signature) return { info, tx: null as ParsedTransaction | null };
    const result = await rpcRequest<ParsedTransaction | null>(
      endpoints,
      "getTransaction",
      [info.signature, TX_OPTIONS],
      rpcOpts,
    );
    return { info, tx: result.ok ? result.value : null };
  });

  const transactions: WalletTx[] = [];
  const transfers: SolTransfer[] = [];
  let done = 0;
  for (const item of parsed) {
    const tx = txFromParsed(item.tx ?? undefined, item.info.signature) ?? txFromSignature(item.info);
    if (tx) transactions.push(tx);
    if (item.tx && !item.tx.meta?.err) {
      transfers.push(...extractTransfers(item.tx, address));
    }
    done += 1;
    options.onProgress?.(done, infos.length);
  }

  return { transactions, transfers, nextBefore };
}
