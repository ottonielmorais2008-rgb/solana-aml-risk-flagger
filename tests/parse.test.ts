import { describe, expect, it } from "vitest";
import { extractTransfers, sortTransfers, SYSTEM_PROGRAM, type ParsedTransaction } from "../src/lib/parse.js";
import { A, ME, transfer } from "./helpers.js";

function tx(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    slot: 10,
    blockTime: 1_700_000_100,
    meta: { err: null, innerInstructions: [] },
    transaction: {
      signatures: ["SigABCDEFGHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx123456"],
      message: { instructions: [] },
    },
    ...overrides,
  };
}

function systemTransfer(source: string, destination: string, lamports: number) {
  return {
    programId: SYSTEM_PROGRAM,
    program: "system",
    parsed: { type: "transfer" as const, info: { source, destination, lamports } },
  };
}

describe("extractTransfers", () => {
  it("keeps top-level and inner system transfers that involve the wallet", () => {
    const parsed = tx({
      meta: {
        err: null,
        innerInstructions: [
          { instructions: [systemTransfer(ME, A, 2_000_000)] },
        ],
      },
      transaction: {
        signatures: ["SigInnerAndOuterxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx111"],
        message: { instructions: [systemTransfer(A, ME, 3_000_000)] },
      },
    });
    const transfers = extractTransfers(parsed, ME);
    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toMatchObject({ source: A, destination: ME, lamports: 3_000_000, inner: false, index: 0 });
    expect(transfers[1]).toMatchObject({ source: ME, destination: A, lamports: 2_000_000, inner: true, index: 1 });
  });

  it("ignores other programs, zero amounts and transfers that do not involve the wallet", () => {
    const parsed = tx({
      transaction: {
        signatures: ["SigIgnorexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx222"],
        message: {
          instructions: [
            { program: "spl-token", programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", parsed: { type: "transfer", info: { source: ME, destination: A, lamports: 5 } } },
            systemTransfer(ME, A, 0),
            systemTransfer(A, A, 1_000_000),
          ],
        },
      },
    });
    expect(extractTransfers(parsed, ME)).toEqual([]);
  });

  it("returns nothing for a missing transaction", () => {
    expect(extractTransfers(null, ME)).toEqual([]);
    expect(extractTransfers({}, ME)).toEqual([]);
  });
});

describe("sortTransfers", () => {
  it("orders by time, then slot, then signature and index", () => {
    const sorted = sortTransfers([
      transfer({ source: ME, destination: A, signature: "b", blockTime: 20, slot: 2, index: 1 }),
      transfer({ source: ME, destination: A, signature: "a", blockTime: 20, slot: 2, index: 0 }),
      transfer({ source: ME, destination: A, signature: "c", blockTime: 10, slot: 9, index: 0 }),
    ]);
    expect(sorted.map((t) => `${t.signature}:${t.index}`)).toEqual(["c:0", "a:0", "b:1"]);
  });
});
