import { sortTransfers } from "./parse.js";
import { formatSol, formatDuration, shortAddress } from "./format.js";
import type { Analysis, ClassifiedTransfer, FlagKind, RiskFlag, RiskLevel, SolTransfer, WalletTx } from "./types.js";

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const FAST_WINDOW_SECONDS = 15 * 60;
export const FAST_AMOUNT_RATIO = 0.8;
export const SMALL_INBOUND_LAMPORTS = 50_000_000; // 0.05 SOL
export const STRUCTURING_MIN_COUNT = 5;
export const STRUCTURING_MIN_SOURCES = 3;
export const STRUCTURING_HIGH_COUNT = 10;
export const REPEATED_MIN_COUNT = 4;
export const BURST_WINDOW_SECONDS = 10 * 60;
export const BURST_MIN_TXS = 8;
export const BURST_MEDIUM_COUNT = 15;

export interface FastPair {
  inbound: SolTransfer;
  outbound: SolTransfer;
  delaySeconds: number;
}

function similarAmount(a: number, b: number, ratio = FAST_AMOUNT_RATIO): boolean {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return max > 0 && min / max >= ratio;
}

function delaySeconds(from: SolTransfer, to: SolTransfer): number | null {
  if (from.blockTime != null && to.blockTime != null) return to.blockTime - from.blockTime;
  if (from.slot > 0 && to.slot >= from.slot) return (to.slot - from.slot) * 0.4;
  return null;
}

/** Pair each inbound transfer with a later outbound of a similar amount inside the time window. */
export function findFastPairs(address: string, transfers: SolTransfer[]): FastPair[] {
  const ordered = sortTransfers(transfers);
  const inbound = ordered.filter((t) => t.destination === address);
  const outbound = ordered.filter((t) => t.source === address);
  const used = new Set<number>();
  const pairs: FastPair[] = [];

  for (const inn of inbound) {
    const matchIndex = outbound.findIndex((out, i) => {
      if (used.has(i)) return false;
      const delay = delaySeconds(inn, out);
      if (delay == null || delay < 0 || delay > FAST_WINDOW_SECONDS) return false;
      return similarAmount(inn.lamports, out.lamports);
    });
    if (matchIndex < 0) continue;
    const outboundTx = outbound[matchIndex]!;
    used.add(matchIndex);
    pairs.push({
      inbound: inn,
      outbound: outboundTx,
      delaySeconds: delaySeconds(inn, outboundTx) ?? 0,
    });
  }
  return pairs;
}

export function findStructuring(address: string, transfers: SolTransfer[]): SolTransfer[] {
  return transfers.filter(
    (t) => t.destination === address && t.lamports > 0 && t.lamports <= SMALL_INBOUND_LAMPORTS,
  );
}

export function findRepeatedCounterparties(
  address: string,
  transfers: SolTransfer[],
  minCount = REPEATED_MIN_COUNT,
): { counterparty: string; transfers: SolTransfer[] }[] {
  const groups = new Map<string, SolTransfer[]>();
  for (const t of transfers) {
    const counterparty = t.source === address ? t.destination : t.source;
    const list = groups.get(counterparty) ?? [];
    list.push(t);
    groups.set(counterparty, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= minCount)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([counterparty, list]) => ({ counterparty, transfers: list }));
}

export function findBurstWindow(
  transactions: WalletTx[],
  windowSeconds = BURST_WINDOW_SECONDS,
  minCount = BURST_MIN_TXS,
): { transactions: WalletTx[]; windowSeconds: number } | null {
  const timed = transactions
    .filter((tx) => !tx.err && tx.blockTime != null)
    .sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0) || a.slot - b.slot);
  let best: WalletTx[] = [];
  let left = 0;
  for (let right = 0; right < timed.length; right += 1) {
    const end = timed[right]!.blockTime!;
    while (end - timed[left]!.blockTime! > windowSeconds) left += 1;
    const slice = timed.slice(left, right + 1);
    if (slice.length > best.length) best = slice;
  }
  if (best.length < minCount) return null;
  const first = best[0]!.blockTime!;
  const last = best[best.length - 1]!.blockTime!;
  return { transactions: best, windowSeconds: Math.max(0, last - first) };
}

export function overallRisk(flags: RiskFlag[]): RiskLevel {
  if (flags.some((f) => f.severity === "high")) return "high";
  if (flags.some((f) => f.severity === "medium")) return "medium";
  if (flags.some((f) => f.severity === "low")) return "low";
  return "none";
}

function uniqueSignatures(values: Array<{ signature: string } | string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const sig = typeof value === "string" ? value : value.signature;
    if (!sig || seen.has(sig)) continue;
    seen.add(sig);
    out.push(sig);
  }
  return out;
}

export function analyzeWallet(address: string, transactions: WalletTx[], transfers: SolTransfer[]): Analysis {
  const flags: RiskFlag[] = [];
  const flagged = new Map<string, Set<FlagKind>>();
  const mark = (signature: string, kind: FlagKind) => {
    const set = flagged.get(signature) ?? new Set<FlagKind>();
    set.add(kind);
    flagged.set(signature, set);
  };

  const pairs = findFastPairs(address, transfers);
  if (pairs.length) {
    const sigs = uniqueSignatures(pairs.flatMap((p) => [p.inbound, p.outbound]));
    const total = pairs.reduce((sum, p) => sum + p.inbound.lamports, 0);
    const examples = pairs
      .slice(0, 3)
      .map(
        (p) =>
          `${formatSol(p.inbound.lamports)} SOL in (${shortAddress(p.inbound.signature, 8, 6)}) then ${formatSol(p.outbound.lamports)} SOL out ${formatDuration(p.delaySeconds)} later (${shortAddress(p.outbound.signature, 8, 6)})`,
      );
    const more = pairs.length > 3 ? ` And ${pairs.length - 3} more pair${pairs.length - 3 === 1 ? "" : "s"}.` : "";
    flags.push({
      id: "fast-in-out",
      kind: "fast-in-out",
      severity: "high",
      title: "Fast in/out",
      detail: `${pairs.length} inbound transfer${pairs.length === 1 ? " was" : "s were"} followed by a similar outbound transfer within ${FAST_WINDOW_SECONDS / 60} minutes (at least ${Math.round(FAST_AMOUNT_RATIO * 100)}% of the amount). About ${formatSol(total)} SOL was received in the paired inbound transfers. ${examples.join("; ")}.${more}`,
      txSignatures: sigs,
      count: pairs.length,
      lamports: total,
      windowSeconds: FAST_WINDOW_SECONDS,
    });
    for (const sig of sigs) mark(sig, "fast-in-out");
  }

  const smallIns = findStructuring(address, transfers);
  const sources = new Set(smallIns.map((t) => t.source));
  if (smallIns.length >= STRUCTURING_MIN_COUNT && sources.size >= STRUCTURING_MIN_SOURCES) {
    const total = smallIns.reduce((sum, t) => sum + t.lamports, 0);
    const severity = smallIns.length >= STRUCTURING_HIGH_COUNT ? "high" : "medium";
    const sigs = uniqueSignatures(smallIns);
    flags.push({
      id: "structuring",
      kind: "structuring",
      severity,
      title: "Many small inbound transfers",
      detail: `${smallIns.length} inbound transfers of ${formatSol(SMALL_INBOUND_LAMPORTS)} SOL or less, from ${sources.size} counterparties, totalling ${formatSol(total)} SOL. This pattern is sometimes called structuring or dusting when it is used to split a larger amount into many small payments.`,
      txSignatures: sigs,
      count: smallIns.length,
      lamports: total,
    });
    for (const sig of sigs) mark(sig, "structuring");
  }

  for (const group of findRepeatedCounterparties(address, transfers)) {
    const sigs = uniqueSignatures(group.transfers);
    const total = group.transfers.reduce((sum, t) => sum + t.lamports, 0);
    flags.push({
      id: `repeated:${group.counterparty}`,
      kind: "repeated-counterparty",
      severity: "medium",
      title: "Repeated counterparty",
      detail: `${shortAddress(group.counterparty)} appears in ${group.transfers.length} SOL transfers with this wallet, totalling ${formatSol(total)} SOL. The same hop used over and over can be a layering pattern — or just a regular payment destination.`,
      txSignatures: sigs,
      counterparty: group.counterparty,
      count: group.transfers.length,
      lamports: total,
    });
    for (const sig of sigs) mark(sig, "repeated-counterparty");
  }

  const burst = findBurstWindow(transactions);
  if (burst) {
    const sigs = uniqueSignatures(burst.transactions);
    const severity = burst.transactions.length >= BURST_MEDIUM_COUNT ? "medium" : "low";
    flags.push({
      id: "burst",
      kind: "burst",
      severity,
      title: "Burst of activity",
      detail: `${burst.transactions.length} successful transactions in ${formatDuration(burst.windowSeconds)} (window of ${BURST_WINDOW_SECONDS / 60} minutes). A sudden cluster of transfers can be a pass-through burst — or just a busy trading session.`,
      txSignatures: sigs,
      count: burst.transactions.length,
      windowSeconds: burst.windowSeconds,
    });
    for (const sig of sigs) mark(sig, "burst");
  }

  const classified: ClassifiedTransfer[] = sortTransfers(transfers)
    .reverse()
    .map((transfer) => ({
      transfer,
      direction: (transfer.destination === address ? "in" : "out") as ClassifiedTransfer["direction"],
      counterparty: transfer.destination === address ? transfer.source : transfer.destination,
      flags: [...(flagged.get(transfer.signature) ?? [])],
    }));

  const inbound = transfers.filter((t) => t.destination === address);
  const outbound = transfers.filter((t) => t.source === address);
  const times = transactions.map((t) => t.blockTime).filter((t): t is number => t != null);
  const counts = { "fast-in-out": 0, structuring: 0, "repeated-counterparty": 0, burst: 0 } satisfies Record<FlagKind, number>;
  for (const flag of flags) counts[flag.kind] += 1;

  return {
    address,
    risk: overallRisk(flags),
    transactionsScanned: transactions.length,
    transfersScanned: transfers.length,
    newest: times.length ? Math.max(...times) : undefined,
    oldest: times.length ? Math.min(...times) : undefined,
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    inboundLamports: inbound.reduce((sum, t) => sum + t.lamports, 0),
    outboundLamports: outbound.reduce((sum, t) => sum + t.lamports, 0),
    flags,
    counts,
    transfers: classified,
    transactions,
  };
}
