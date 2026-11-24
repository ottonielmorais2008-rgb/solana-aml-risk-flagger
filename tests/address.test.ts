import { describe, expect, it } from "vitest";
import { base58Decode, isSolanaAddress, parseWalletAddress, shortAddress } from "../src/lib/address.js";
import { ME } from "./helpers.js";

describe("isSolanaAddress", () => {
  it("accepts a 32-byte base58 public key", () => {
    expect(isSolanaAddress(ME)).toBe(true);
    expect(base58Decode(ME)?.length).toBe(32);
  });

  it("rejects empty, short, hex and typo addresses", () => {
    expect(isSolanaAddress("")).toBe(false);
    expect(isSolanaAddress("0xCFDE810678842889CaBb354F29340C34e9E639DA")).toBe(false);
    expect(isSolanaAddress("short")).toBe(false);
    expect(isSolanaAddress(ME.slice(0, 30))).toBe(false);
    expect(isSolanaAddress(ME.replace("G", "0"))).toBe(false);
  });
});

describe("parseWalletAddress", () => {
  it("trims a valid address", () => {
    expect(parseWalletAddress(`  ${ME}  `)).toEqual({ ok: true, address: ME });
  });

  it("explains invalid input", () => {
    expect(parseWalletAddress("")).toMatchObject({ ok: false });
    expect(parseWalletAddress(123)).toMatchObject({ ok: false });
    expect(parseWalletAddress("not-an-address")).toMatchObject({ ok: false });
  });
});

describe("shortAddress", () => {
  it("keeps the start and end visible", () => {
    expect(shortAddress(ME, 4, 4)).toBe(`${ME.slice(0, 4)}…${ME.slice(-4)}`);
  });
});
