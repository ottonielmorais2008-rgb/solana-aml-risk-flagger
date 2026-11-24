import { describe, expect, it, vi } from "vitest";
import { loadHistory } from "../src/lib/history.js";
import { SYSTEM_PROGRAM } from "../src/lib/parse.js";
import { A, ME, sig } from "./helpers.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("loadHistory", () => {
  it("loads signatures, fetches transactions and extracts SOL transfers", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (payload.method === "getSignaturesForAddress") {
        return jsonResponse({
          result: [
            { signature: sig(1), slot: 11, blockTime: 100, err: null },
            { signature: sig(2), slot: 10, blockTime: 90, err: null },
          ],
        });
      }
      const signature = payload.params[0] as string;
      return jsonResponse({
        result: {
          slot: 11,
          blockTime: 100,
          meta: { err: null, innerInstructions: [] },
          transaction: {
            signatures: [signature],
            message: {
              instructions: [
                {
                  programId: SYSTEM_PROGRAM,
                  program: "system",
                  parsed: { type: "transfer", info: { source: A, destination: ME, lamports: 1_000_000 } },
                },
              ],
            },
          },
        },
      });
    });

    const page = await loadHistory(ME, { fetch: fetchFn, sleep: async () => undefined, endpoints: ["https://rpc.example"] });
    expect(page.transactions).toHaveLength(2);
    expect(page.transfers).toHaveLength(2);
    expect(page.transfers[0]?.lamports).toBe(1_000_000);
    expect(page.nextBefore).toBeNull();
    expect(fetchFn).toHaveBeenCalled();
  });

  it("throws a clear error when the RPC fails", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: { message: "rate limited" } }, 200));
    await expect(loadHistory(ME, { fetch: fetchFn, sleep: async () => undefined, endpoints: ["https://rpc.example"] })).rejects.toThrow(
      /rate limited/,
    );
  });

  it("passes the before cursor and reports a next page when the limit is filled", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { method: string; params: [string, { limit?: number; before?: string }] };
      if (payload.method === "getSignaturesForAddress") {
        expect(payload.params[1]?.before).toBe(sig(9));
        return jsonResponse({
          result: Array.from({ length: 2 }, (_, i) => ({ signature: sig(i + 1), slot: i, blockTime: i, err: null })),
        });
      }
      return jsonResponse({ result: null });
    });
    const page = await loadHistory(ME, {
      fetch: fetchFn,
      sleep: async () => undefined,
      endpoints: ["https://rpc.example"],
      limit: 2,
      before: sig(9),
    });
    expect(page.nextBefore).toBe(sig(2));
    expect(page.transactions).toHaveLength(2);
  });
});
