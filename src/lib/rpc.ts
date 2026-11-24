export const DEFAULT_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
] as const;

export interface RpcFailure {
  kind: "rpc";
  status?: number;
  message: string;
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcFailure };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface JsonRpcResponse<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rpcRequest<T>(
  endpoints: readonly string[],
  method: string,
  params: unknown[],
  options: { fetch?: FetchLike; retries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RpcResult<T>> {
  const fetchFn = options.fetch ?? fetch;
  const retries = options.retries ?? 2;
  const pause = options.sleep ?? sleep;
  let lastMessage = "The Solana RPC request failed.";
  let lastStatus: number | undefined;

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        lastStatus = response.status;
        if (RETRYABLE.has(response.status)) {
          lastMessage =
            response.status === 429
              ? "The public RPC is rate-limited. Please wait a moment and try again."
              : `The public RPC returned HTTP ${response.status}.`;
          await pause(200 * 2 ** attempt);
          continue;
        }
        if (!response.ok) {
          lastMessage = `The public RPC returned HTTP ${response.status}.`;
          break;
        }
        const payload = (await response.json()) as JsonRpcResponse<T>;
        if (payload.error) {
          lastMessage = payload.error.message ?? "The public RPC returned an error.";
          break;
        }
        if (payload.result === undefined) {
          lastMessage = "The public RPC returned an empty result.";
          break;
        }
        return { ok: true, value: payload.result };
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : "The public RPC request failed.";
        await pause(200 * 2 ** attempt);
      }
    }
  }

  return { ok: false, error: { kind: "rpc", status: lastStatus, message: lastMessage } };
}

export function errorMessage(result: RpcResult<unknown>, fallback: string): string {
  return result.ok ? fallback : result.error.message;
}
