import { parseWalletAddress } from "./address.js";
import { DEMO_ADDRESS } from "./demo.js";

/** Address to scan on first load: ?address=… when valid, otherwise the demo address. */
export function initialAddress(search: string): { address: string; isDemo: boolean } {
  const param = new URLSearchParams(search).get("address");
  const parsed = param ? parseWalletAddress(param) : null;
  if (parsed?.ok && parsed.address !== DEMO_ADDRESS) return { address: parsed.address, isDemo: false };
  return { address: DEMO_ADDRESS, isDemo: true };
}

export function validateInput(value: string): { ok: true; address: string } | { ok: false; error: string } {
  return parseWalletAddress(value);
}
