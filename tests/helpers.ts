import type { SolTransfer, WalletTx } from "../src/lib/types.js";

export const ME = "G5GFpTfMFPU31nmXzu5C7198RqXiVC49ToUA1h5pGyph";
export const A = "B6fsDRqpKSkQfufAZfnDRpRNRmkzCM4gKp8aBi3UDode";
export const B = "DqrGeQ3pTXqK6qVLUbAqcjvWnP2K6LEBCJ17TE6i3iSF";
export const C = "BiHtkcqDoByz6EkCLRuPKF8bbSCdDhgFkWU4RYGAy5FT";
export const D = "A1A1bDGXpu6ew8n3fgrzQfZW33cP4vVzAnhTeJJqe1uw";

export function transfer(overrides: Partial<SolTransfer> & Pick<SolTransfer, "source" | "destination" | "signature">): SolTransfer {
  return {
    index: 0,
    slot: 100,
    blockTime: 1_700_000_000,
    lamports: 50_000_000,
    inner: false,
    ...overrides,
  };
}

export function tx(overrides: Partial<WalletTx> & Pick<WalletTx, "signature">): WalletTx {
  return {
    slot: 100,
    blockTime: 1_700_000_000,
    err: false,
    ...overrides,
  };
}

export function sig(n: number): string {
  const body = `sig${n}`.padEnd(64, "x").replace(/[^1-9A-HJ-NP-Za-km-z]/g, "x");
  // base58-ish dummy signatures for tests that only need unique strings
  return body.replace(/0/g, "o").replace(/I/g, "J").replace(/O/g, "P").replace(/l/g, "L");
}
