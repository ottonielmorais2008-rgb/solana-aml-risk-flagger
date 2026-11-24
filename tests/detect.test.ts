import { describe, expect, it } from "vitest";
import {
  analyzeWallet,
  BURST_MIN_TXS,
  BURST_WINDOW_SECONDS,
  FAST_WINDOW_SECONDS,
  findBurstWindow,
  findFastPairs,
  findRepeatedCounterparties,
  findStructuring,
  overallRisk,
  SMALL_INBOUND_LAMPORTS,
  STRUCTURING_MIN_COUNT,
} from "../src/lib/detect.js";
import type { RiskFlag } from "../src/lib/types.js";
import { A, B, C, D, ME, sig, transfer, tx } from "./helpers.js";

const t0 = 1_700_000_000;

describe("findFastPairs", () => {
  it("pairs an inbound transfer with a later similar outbound inside the window", () => {
    const pairs = findFastPairs(ME, [
      transfer({ source: A, destination: ME, signature: sig(1), lamports: 100_000_000, blockTime: t0 }),
      transfer({ source: ME, destination: B, signature: sig(2), lamports: 90_000_000, blockTime: t0 + 120 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.delaySeconds).toBe(120);
    expect(pairs[0]?.inbound.signature).toBe(sig(1));
    expect(pairs[0]?.outbound.signature).toBe(sig(2));
  });

  it("does not pair transfers outside the time window or with unlike amounts", () => {
    const late = findFastPairs(ME, [
      transfer({ source: A, destination: ME, signature: sig(1), lamports: 100_000_000, blockTime: t0 }),
      transfer({ source: ME, destination: B, signature: sig(2), lamports: 100_000_000, blockTime: t0 + FAST_WINDOW_SECONDS + 1 }),
    ]);
    const unlike = findFastPairs(ME, [
      transfer({ source: A, destination: ME, signature: sig(1), lamports: 100_000_000, blockTime: t0 }),
      transfer({ source: ME, destination: B, signature: sig(2), lamports: 10_000_000, blockTime: t0 + 30 }),
    ]);
    expect(late).toEqual([]);
    expect(unlike).toEqual([]);
  });

  it("uses each outbound transfer in at most one pair", () => {
    const pairs = findFastPairs(ME, [
      transfer({ source: A, destination: ME, signature: sig(1), lamports: 100_000_000, blockTime: t0, index: 0 }),
      transfer({ source: B, destination: ME, signature: sig(2), lamports: 100_000_000, blockTime: t0 + 10, index: 0 }),
      transfer({ source: ME, destination: C, signature: sig(3), lamports: 100_000_000, blockTime: t0 + 20 }),
    ]);
    expect(pairs).toHaveLength(1);
  });
});

describe("findStructuring", () => {
  it("collects inbound transfers at or below the small-amount threshold", () => {
    const small = findStructuring(ME, [
      transfer({ source: A, destination: ME, signature: sig(1), lamports: SMALL_INBOUND_LAMPORTS }),
      transfer({ source: B, destination: ME, signature: sig(2), lamports: SMALL_INBOUND_LAMPORTS + 1 }),
      transfer({ source: ME, destination: C, signature: sig(3), lamports: 1 }),
    ]);
    expect(small).toHaveLength(1);
    expect(small[0]?.signature).toBe(sig(1));
  });
});

describe("findRepeatedCounterparties", () => {
  it("groups a counterparty that appears often enough", () => {
    const transfers = [
      transfer({ source: A, destination: ME, signature: sig(1), index: 0 }),
      transfer({ source: ME, destination: A, signature: sig(2), index: 0 }),
      transfer({ source: A, destination: ME, signature: sig(3), index: 0 }),
      transfer({ source: A, destination: ME, signature: sig(4), index: 0 }),
      transfer({ source: B, destination: ME, signature: sig(5), index: 0 }),
    ];
    const groups = findRepeatedCounterparties(ME, transfers, 4);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.counterparty).toBe(A);
    expect(groups[0]?.transfers).toHaveLength(4);
  });
});

describe("findBurstWindow", () => {
  it("returns the densest successful window and ignores failed transactions", () => {
    const transactions = [
      tx({ signature: sig(1), blockTime: t0, err: true }),
      ...Array.from({ length: BURST_MIN_TXS }, (_, i) => tx({ signature: sig(i + 2), blockTime: t0 + i * 10 })),
      tx({ signature: sig(20), blockTime: t0 + BURST_WINDOW_SECONDS + 1000 }),
    ];
    const burst = findBurstWindow(transactions);
    expect(burst?.transactions).toHaveLength(BURST_MIN_TXS);
    expect(burst?.windowSeconds).toBe((BURST_MIN_TXS - 1) * 10);
    expect(findBurstWindow(transactions.slice(0, 3))).toBeNull();
  });
});

describe("overallRisk", () => {
  it("takes the highest severity present", () => {
    const flag = (severity: RiskFlag["severity"]): RiskFlag => ({
      id: severity,
      kind: "burst",
      severity,
      title: "x",
      detail: "x",
      txSignatures: [sig(1)],
    });
    expect(overallRisk([])).toBe("none");
    expect(overallRisk([flag("low")])).toBe("low");
    expect(overallRisk([flag("low"), flag("medium")])).toBe("medium");
    expect(overallRisk([flag("medium"), flag("high")])).toBe("high");
  });
});

describe("analyzeWallet", () => {
  it("raises every rule on a pass-through pattern and backs each flag with a signature", () => {
    const transactions = Array.from({ length: 10 }, (_, i) => tx({ signature: sig(i + 1), blockTime: t0 + i * 30, slot: 100 + i }));
    const transfers = [
      transfer({ source: A, destination: ME, signature: sig(1), lamports: 40_000_000, blockTime: t0 }),
      transfer({ source: ME, destination: A, signature: sig(2), lamports: 39_000_000, blockTime: t0 + 30 }),
      transfer({ source: B, destination: ME, signature: sig(3), lamports: 40_000_000, blockTime: t0 + 60 }),
      transfer({ source: ME, destination: A, signature: sig(4), lamports: 39_000_000, blockTime: t0 + 90 }),
      transfer({ source: C, destination: ME, signature: sig(5), lamports: 40_000_000, blockTime: t0 + 120 }),
      transfer({ source: ME, destination: A, signature: sig(6), lamports: 39_000_000, blockTime: t0 + 150 }),
      transfer({ source: D, destination: ME, signature: sig(7), lamports: 40_000_000, blockTime: t0 + 180 }),
      transfer({ source: ME, destination: A, signature: sig(8), lamports: 39_000_000, blockTime: t0 + 210 }),
      transfer({ source: A, destination: ME, signature: sig(9), lamports: 40_000_000, blockTime: t0 + 240 }),
      transfer({ source: ME, destination: B, signature: sig(10), lamports: 39_000_000, blockTime: t0 + 270 }),
    ];
    const analysis = analyzeWallet(ME, transactions, transfers);
    expect(analysis.risk).toBe("high");
    expect(analysis.counts["fast-in-out"]).toBe(1);
    expect(analysis.counts.structuring).toBe(1);
    expect(analysis.counts["repeated-counterparty"]).toBeGreaterThanOrEqual(1);
    expect(analysis.counts.burst).toBe(1);
    expect(analysis.flags.length).toBeGreaterThanOrEqual(4);
    for (const flag of analysis.flags) {
      expect(flag.txSignatures.length).toBeGreaterThan(0);
    }
    expect(analysis.transfers.some((t) => t.flags.includes("fast-in-out"))).toBe(true);
  });

  it("returns no flags for an ordinary single payment", () => {
    const analysis = analyzeWallet(ME, [tx({ signature: sig(1) })], [
      transfer({ source: ME, destination: A, signature: sig(1), lamports: 2_000_000_000 }),
    ]);
    expect(analysis.risk).toBe("none");
    expect(analysis.flags).toEqual([]);
    expect(analysis.outboundLamports).toBe(2_000_000_000);
  });

  it("does not flag small inbound payments from a single counterparty as structuring", () => {
    const transfers = Array.from({ length: STRUCTURING_MIN_COUNT }, (_, i) =>
      transfer({ source: A, destination: ME, signature: sig(i + 1), lamports: 10_000_000, blockTime: t0 + i }),
    );
    const analysis = analyzeWallet(
      ME,
      transfers.map((t, i) => tx({ signature: t.signature, blockTime: t0 + i })),
      transfers,
    );
    expect(analysis.counts.structuring).toBe(0);
  });
});
