import { describe, expect, it } from "vitest";
import { DEMO_ADDRESS } from "../src/lib/demo.js";
import { FLAG_LABEL, RISK_LABEL, formatDuration, formatSol, txUrl } from "../src/lib/format.js";
import { initialAddress, validateInput } from "../src/lib/ui-state.js";
import { ME } from "./helpers.js";

describe("initialAddress", () => {
  it("uses the demo address when no query is present", () => {
    expect(initialAddress("")).toEqual({ address: DEMO_ADDRESS, isDemo: true });
    expect(initialAddress("?other=1")).toEqual({ address: DEMO_ADDRESS, isDemo: true });
  });

  it("uses a valid ?address= parameter and treats the demo as demo", () => {
    expect(initialAddress(`?address=${ME}`)).toEqual({ address: ME, isDemo: true });
    const other = "B6fsDRqpKSkQfufAZfnDRpRNRmkzCM4gKp8aBi3UDode";
    expect(initialAddress(`?address=${other}`)).toEqual({ address: other, isDemo: false });
    expect(initialAddress("?address=not-valid")).toEqual({ address: DEMO_ADDRESS, isDemo: true });
  });
});

describe("validateInput", () => {
  it("accepts a trimmed Solana address and rejects empty or invalid values", () => {
    expect(validateInput(`  ${ME}  `)).toEqual({ ok: true, address: ME });
    expect(validateInput("")).toMatchObject({ ok: false });
    expect(validateInput("0x123")).toMatchObject({ ok: false });
  });
});

describe("format helpers", () => {
  it("formats SOL amounts, durations and explorer links", () => {
    expect(formatSol(0)).toBe("0");
    expect(formatSol(1_000_000_000)).toBe("1");
    expect(formatSol(50_000_000)).toMatch(/0\.05/);
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3600)).toBe("1h");
    expect(txUrl("abc")).toBe("https://explorer.solana.com/tx/abc");
    expect(FLAG_LABEL["fast-in-out"]).toBe("Fast in/out");
    expect(RISK_LABEL.none).toBe("No flags");
  });
});
