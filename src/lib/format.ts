import type { FlagKind, RiskLevel } from "./types.js";

export const EXPLORER = "https://explorer.solana.com";
export const LAMPORTS_PER_SOL = 1_000_000_000;

export function addressUrl(address: string): string {
  return `${EXPLORER}/address/${address}`;
}

export function txUrl(signature: string): string {
  return `${EXPLORER}/tx/${signature}`;
}

export function shortAddress(address: string, start = 8, end = 6): string {
  if (address.length <= start + end + 1) return address;
  return `${address.slice(0, start)}…${address.slice(-end)}`;
}

export function formatSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol === 0) return "0";
  if (Math.abs(sol) < 0.001) return sol.toLocaleString("en-US", { maximumSignificantDigits: 2 });
  if (Math.abs(sol) < 1) return sol.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return sol.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  const rem = s % 60;
  if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min ? `${hours}h ${min}m` : `${hours}h`;
}

export function formatDate(unixSeconds: number | string | undefined): string {
  if (unixSeconds == null || unixSeconds === "") return "—";
  const n = typeof unixSeconds === "string" ? Date.parse(unixSeconds) / 1000 : unixSeconds;
  if (!Number.isFinite(n)) return "—";
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function formatDay(unixSeconds: number | undefined): string {
  if (unixSeconds == null) return "—";
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export const FLAG_LABEL: Record<FlagKind, string> = {
  "fast-in-out": "Fast in/out",
  structuring: "Small inbound",
  "repeated-counterparty": "Repeated counterparty",
  burst: "Burst",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No flags",
};
