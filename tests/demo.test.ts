import { describe, expect, it } from "vitest";
import { DEMO_ADDRESS, loadDemoSnapshot } from "../src/lib/demo.js";
import { analyzeWallet } from "../src/lib/detect.js";

describe("demo snapshot", () => {
  it("loads the saved address and produces flags each backed by a signature", () => {
    const demo = loadDemoSnapshot();
    expect(demo.address).toBe(DEMO_ADDRESS);
    expect(demo.transactions.length).toBeGreaterThan(0);
    expect(demo.transfers.length).toBeGreaterThan(0);
    const analysis = analyzeWallet(demo.address, demo.transactions, demo.transfers);
    expect(analysis.flags.length).toBeGreaterThan(0);
    expect(analysis.risk).not.toBe("none");
    for (const flag of analysis.flags) {
      expect(flag.txSignatures.length).toBeGreaterThan(0);
    }
  });
});
