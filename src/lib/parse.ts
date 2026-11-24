import type { SolTransfer, WalletTx } from "./types.js";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

interface ParsedInfo {
  source?: string;
  destination?: string;
  lamports?: number | string;
}

interface ParsedInstruction {
  programId?: string;
  program?: string;
  parsed?: { type?: string; info?: ParsedInfo };
}

interface InnerInstructions {
  index?: number;
  instructions?: ParsedInstruction[];
}

interface AccountKey {
  pubkey?: string;
}

export interface ParsedTransaction {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    innerInstructions?: InnerInstructions[];
  } | null;
  transaction?: {
    signatures?: string[];
    message?: {
      accountKeys?: Array<string | AccountKey>;
      instructions?: ParsedInstruction[];
    };
  };
}

export interface SignatureInfo {
  signature?: string;
  slot?: number;
  blockTime?: number | null;
  err?: unknown;
}

export function txFromSignature(info: SignatureInfo): WalletTx | null {
  if (!info.signature || typeof info.signature !== "string") return null;
  return {
    signature: info.signature,
    slot: typeof info.slot === "number" ? info.slot : 0,
    blockTime: typeof info.blockTime === "number" ? info.blockTime : null,
    err: info.err != null,
  };
}

export function txFromParsed(parsed: ParsedTransaction | null | undefined, fallbackSig?: string): WalletTx | null {
  const signature = parsed?.transaction?.signatures?.[0] ?? fallbackSig;
  if (!signature) return null;
  return {
    signature,
    slot: typeof parsed?.slot === "number" ? parsed.slot : 0,
    blockTime: typeof parsed?.blockTime === "number" ? parsed.blockTime : null,
    err: parsed?.meta?.err != null,
  };
}

function isSystemTransfer(ix: ParsedInstruction): { source: string; destination: string; lamports: number } | null {
  const program = ix.programId ?? "";
  const isSystem = program === SYSTEM_PROGRAM || ix.program === "system";
  if (!isSystem) return null;
  const type = ix.parsed?.type;
  if (type !== "transfer" && type !== "transferChecked") return null;
  const info = ix.parsed?.info;
  if (!info || typeof info.source !== "string" || typeof info.destination !== "string") return null;
  const lamports = Number(info.lamports);
  if (!Number.isFinite(lamports) || lamports <= 0) return null;
  return { source: info.source, destination: info.destination, lamports };
}

/**
 * Pull native SOL system transfers that involve `address`, including inner instructions
 * (transfers made by a program on behalf of the wallet).
 */
export function extractTransfers(parsed: ParsedTransaction | null | undefined, address: string): SolTransfer[] {
  if (!parsed?.transaction) return [];
  const signature = parsed.transaction.signatures?.[0];
  if (!signature) return [];
  const slot = typeof parsed.slot === "number" ? parsed.slot : 0;
  const blockTime = typeof parsed.blockTime === "number" ? parsed.blockTime : null;
  const out: SolTransfer[] = [];
  let index = 0;

  const take = (ixs: ParsedInstruction[] | undefined, inner: boolean) => {
    for (const ix of ixs ?? []) {
      const transfer = isSystemTransfer(ix);
      if (!transfer) continue;
      if (transfer.source !== address && transfer.destination !== address) continue;
      out.push({
        signature,
        index,
        slot,
        blockTime,
        source: transfer.source,
        destination: transfer.destination,
        lamports: transfer.lamports,
        inner,
      });
      index += 1;
    }
  };

  take(parsed.transaction.message?.instructions, false);
  for (const inner of parsed.meta?.innerInstructions ?? []) {
    take(inner.instructions, true);
  }
  return out;
}

export function sortTransfers(transfers: SolTransfer[]): SolTransfer[] {
  return [...transfers].sort((a, b) => {
    const ta = a.blockTime ?? 0;
    const tb = b.blockTime ?? 0;
    if (ta !== tb) return ta - tb;
    if (a.slot !== b.slot) return a.slot - b.slot;
    if (a.signature !== b.signature) return a.signature.localeCompare(b.signature);
    return a.index - b.index;
  });
}
