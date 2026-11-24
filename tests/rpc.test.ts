import { describe, expect, it, vi } from "vitest";
import { rpcRequest } from "../src/lib/rpc.js";

describe("rpcRequest", () => {
  it("returns the result from the first healthy endpoint", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ result: { ok: true } }), { status: 200 }));
    const result = await rpcRequest(["https://a.example"], "getHealth", [], { fetch: fetchFn, sleep: async () => undefined });
    expect(result).toEqual({ ok: true, value: { ok: true } });
  });

  it("retries a 429 and then falls back to the next endpoint", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow", { status: 429 }))
      .mockResolvedValueOnce(new Response("slow", { status: 429 }))
      .mockResolvedValueOnce(new Response("slow", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }), { status: 200 }));
    const result = await rpcRequest(["https://a.example", "https://b.example"], "getSlot", [], {
      fetch: fetchFn,
      sleep: async () => undefined,
      retries: 2,
    });
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("surfaces an RPC error message", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { message: "blocked" } }), { status: 200 }));
    const result = await rpcRequest(["https://a.example"], "getSlot", [], { fetch: fetchFn, sleep: async () => undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("blocked");
  });
});
