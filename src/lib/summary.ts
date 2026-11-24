import { isSolanaAddress } from "./address.js";
import type { Analysis, FlagKind, RiskLevel } from "./types.js";

export const MAX_SUMMARY_CHARS = 8_000;
export const MAX_SUMMARY_FLAGS = 8;
export const MAX_SUMMARY_TXS = 8;

export interface FlagSummary {
  kind: FlagKind;
  severity: Exclude<RiskLevel, "none">;
  title: string;
  count?: number;
  lamports?: number;
  windowSeconds?: number;
  counterparty?: string;
  txSignatures: string[];
}

export interface AnalysisSummary {
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
  flags: FlagSummary[];
  omittedFlags: number;
}

const RISKS = new Set(["high", "medium", "low", "none"]);
const KINDS = new Set(["fast-in-out", "structuring", "repeated-counterparty", "burst"]);
const SEVERITIES = new Set(["high", "medium", "low"]);

function isSignature(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 128 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

export function summarize(analysis: Analysis): AnalysisSummary {
  return {
    address: analysis.address,
    risk: analysis.risk,
    transactionsScanned: analysis.transactionsScanned,
    transfersScanned: analysis.transfersScanned,
    newest: analysis.newest,
    oldest: analysis.oldest,
    inboundCount: analysis.inboundCount,
    outboundCount: analysis.outboundCount,
    inboundLamports: analysis.inboundLamports,
    outboundLamports: analysis.outboundLamports,
    flags: analysis.flags.slice(0, MAX_SUMMARY_FLAGS).map((flag) => ({
      kind: flag.kind,
      severity: flag.severity,
      title: flag.title,
      count: flag.count,
      lamports: flag.lamports,
      windowSeconds: flag.windowSeconds,
      counterparty: flag.counterparty,
      txSignatures: flag.txSignatures.slice(0, MAX_SUMMARY_TXS),
    })),
    omittedFlags: Math.max(0, analysis.flags.length - MAX_SUMMARY_FLAGS),
  };
}

/** Validate an untrusted summary (from the browser) before it reaches the model. */
export function validateSummary(value: unknown): AnalysisSummary | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AnalysisSummary;
  if (typeof v.address !== "string" || !isSolanaAddress(v.address)) return null;
  if (typeof v.risk !== "string" || !RISKS.has(v.risk)) return null;
  if (!Number.isFinite(v.transactionsScanned) || v.transactionsScanned < 0) return null;
  if (!Number.isFinite(v.transfersScanned) || v.transfersScanned < 0) return null;
  if (!Array.isArray(v.flags) || v.flags.length > MAX_SUMMARY_FLAGS) return null;
  for (const flag of v.flags) {
    if (!flag || typeof flag !== "object") return null;
    if (typeof flag.kind !== "string" || !KINDS.has(flag.kind)) return null;
    if (typeof flag.severity !== "string" || !SEVERITIES.has(flag.severity)) return null;
    if (typeof flag.title !== "string" || flag.title.length > 80) return null;
    if (flag.counterparty !== undefined && (typeof flag.counterparty !== "string" || !isSolanaAddress(flag.counterparty))) {
      return null;
    }
    if (!Array.isArray(flag.txSignatures) || flag.txSignatures.length < 1 || flag.txSignatures.length > MAX_SUMMARY_TXS) {
      return null;
    }
    if (flag.txSignatures.some((sig) => !isSignature(sig))) return null;
  }
  return v;
}

export function serializeSummary(summary: AnalysisSummary): string {
  return JSON.stringify(summary);
}
