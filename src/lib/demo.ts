import snapshot from "../data/demo-snapshot.json";
import type { HistoryPage, SolTransfer, WalletTx } from "./types.js";

/**
 * A real mainnet address whose recent public SOL transfers trigger several of
 * the built-in heuristics (fast in/out, many small inbound transfers,
 * repeated counterparties and a burst of activity). The flags are patterns,
 * not a finding of wrongdoing.
 */
export const DEMO_ADDRESS = "G5GFpTfMFPU31nmXzu5C7198RqXiVC49ToUA1h5pGyph";

export interface DemoSnapshot extends HistoryPage {
  address: string;
  savedAt: string;
}

export function loadDemoSnapshot(): DemoSnapshot {
  const raw = snapshot as DemoSnapshot;
  return {
    address: raw.address,
    savedAt: raw.savedAt,
    transactions: raw.transactions as WalletTx[],
    transfers: raw.transfers as SolTransfer[],
    nextBefore: raw.nextBefore ?? null,
  };
}
