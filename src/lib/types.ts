export type RiskLevel = "high" | "medium" | "low" | "none";
export type FlagKind = "fast-in-out" | "structuring" | "repeated-counterparty" | "burst";
export type Direction = "in" | "out";

export interface WalletTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
}

export interface SolTransfer {
  signature: string;
  index: number;
  slot: number;
  blockTime: number | null;
  source: string;
  destination: string;
  lamports: number;
  inner: boolean;
}

export interface FastPair {
  inbound: SolTransfer;
  outbound: SolTransfer;
  delaySeconds: number;
}

export interface RiskFlag {
  id: string;
  kind: FlagKind;
  severity: Exclude<RiskLevel, "none">;
  title: string;
  detail: string;
  /** Every flag is backed by at least one transaction signature. */
  txSignatures: string[];
  counterparty?: string;
  count?: number;
  lamports?: number;
  windowSeconds?: number;
}

export interface ClassifiedTransfer {
  transfer: SolTransfer;
  direction: Direction;
  counterparty: string;
  flags: FlagKind[];
}

export interface Analysis {
  address: string;
  risk: RiskLevel;
  transactionsScanned: number;
  transfersScanned: number;
  newest?: number;
  oldest?: number;
  inboundCount: number;
  outboundCount: number;
  inboundLamports: number;
  outboundLamports: number;
  flags: RiskFlag[];
  counts: Record<FlagKind, number>;
  transfers: ClassifiedTransfer[];
  transactions: WalletTx[];
}

export interface HistoryPage {
  transactions: WalletTx[];
  transfers: SolTransfer[];
  /** Pass to getSignaturesForAddress as `before` to load older signatures. */
  nextBefore: string | null;
}
