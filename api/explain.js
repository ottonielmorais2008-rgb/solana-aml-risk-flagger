// src/lib/rate-limit.ts
var hits = /* @__PURE__ */ new Map();
function allow(key, limit = 20, windowMs = 6e4, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5e3) hits.clear();
  return true;
}
function clientIp(headers, fallback = "unknown") {
  const forwarded = headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (value && value.trim()) return value.split(",")[0].trim();
  const real = headers["x-real-ip"];
  const realValue = Array.isArray(real) ? real[0] : real;
  if (realValue && realValue.trim()) return realValue.trim();
  return fallback;
}

// src/lib/http.ts
var MAX_BODY_BYTES = 16384;
function methodOf(req) {
  return (req.method ?? "GET").toUpperCase();
}
function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
function byteLength(value) {
  return new TextEncoder().encode(value).length;
}
function tooLarge(req, max = MAX_BODY_BYTES) {
  const length = header(req, "content-length");
  if (length && Number(length) > max) return true;
  if (typeof req.body === "string" && byteLength(req.body) > max) return true;
  return false;
}
function readJsonBody(req) {
  if (req.body == null || req.body === "") {
    return { ok: false, error: "Invalid JSON body." };
  }
  if (typeof req.body === "string") {
    try {
      return { ok: true, value: JSON.parse(req.body) };
    } catch {
      return { ok: false, error: "Invalid JSON body." };
    }
  }
  return { ok: true, value: req.body };
}
function cors(res) {
  res.setHeader?.("Access-Control-Allow-Origin", "*");
  res.setHeader?.("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader?.("Access-Control-Allow-Headers", "Content-Type");
}

// src/lib/address.ts
var BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(input) {
  let value = 0n;
  for (const ch of input) {
    const digit = BASE58.indexOf(ch);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }
  for (const ch of input) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
function isSolanaAddress(input) {
  const trimmed = input.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return base58Decode(trimmed)?.length === 32;
}

// src/lib/summary.ts
var MAX_SUMMARY_CHARS = 8e3;
var MAX_SUMMARY_FLAGS = 8;
var MAX_SUMMARY_TXS = 8;
var RISKS = /* @__PURE__ */ new Set(["high", "medium", "low", "none"]);
var KINDS = /* @__PURE__ */ new Set(["fast-in-out", "structuring", "repeated-counterparty", "burst"]);
var SEVERITIES = /* @__PURE__ */ new Set(["high", "medium", "low"]);
function isSignature(value) {
  return typeof value === "string" && value.length >= 32 && value.length <= 128 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}
function validateSummary(value) {
  if (!value || typeof value !== "object") return null;
  const v = value;
  if (typeof v.address !== "string" || !isSolanaAddress(v.address)) return null;
  if (typeof v.risk !== "string" || !RISKS.has(v.risk)) return null;
  if (!Number.isFinite(v.transactionsScanned) || v.transactionsScanned < 0) return null;
  if (!Number.isFinite(v.transfersScanned) || v.transfersScanned < 0) return null;
  if (!Array.isArray(v.flags) || v.flags.length > MAX_SUMMARY_FLAGS) return null;
  for (const flag of v.flags) {
    if (!flag || typeof flag !== "object") return null;
    if (typeof flag.kind !== "string" || !KINDS.has(flag.kind)) return null;
    if (typeof flag.severity !== "string" || !SEVERITIES.has(flag.severity)) return null;
    if (typeof flag.title !== "string" || flag.title.length > 80) return null;
    if (flag.counterparty !== void 0 && (typeof flag.counterparty !== "string" || !isSolanaAddress(flag.counterparty))) {
      return null;
    }
    if (!Array.isArray(flag.txSignatures) || flag.txSignatures.length < 1 || flag.txSignatures.length > MAX_SUMMARY_TXS) {
      return null;
    }
    if (flag.txSignatures.some((sig) => !isSignature(sig))) return null;
  }
  return v;
}
function serializeSummary(summary) {
  return JSON.stringify(summary);
}

// src/lib/explain.ts
var EXPLAIN_LIMIT = 6;
var EXPLAIN_WINDOW_MS = 6e4;
var DEFAULT_MODEL = "gemini-3.5-flash-lite";
var SYSTEM = `You explain the result of a read-only Solana wallet risk scan, in plain English, for a non-expert.
The scan only applies simple, transparent heuristics to recent public SOL transfers. It is not a finding of money laundering, and a flagged wallet is not necessarily illicit.
Flags in the data:
- "fast-in-out": funds received and a similar amount sent out shortly afterwards.
- "structuring": many small inbound transfers from several counterparties.
- "repeated-counterparty": the same address appears in several transfers.
- "burst": many successful transactions in a short window.
Every flag is already backed by one or more transaction signatures in the data. Refer to those signatures by their first 8 and last 6 characters (Abcdefgh\u2026xyz123). Do not invent signatures, amounts, dates, names or owners.
Rules:
- Use only the supplied data. If a field is missing, do not guess it.
- Explain what each present flag means and why someone might want to inspect the linked transactions. Mention that the same patterns can also have innocent explanations (paying a regular destination, a busy trading session, tips).
- Do not accuse anyone of a crime. Do not give financial, legal or investment advice. Do not tell the reader to send, swap, approve or interact with any account.
- Mention that the scan only covers the recent transactions listed (counts and, when present, the oldest and newest unix timestamps).
- Be concise: 2\u20134 short paragraphs, no headings, no bullet lists.`;
function getGeminiApiKey(env = process.env) {
  const key = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!key || !key.trim()) return void 0;
  return key.trim();
}
function getModelId(env = process.env) {
  return env.GOOGLE_MODEL?.trim() || DEFAULT_MODEL;
}
function prepareExplainPayload(input) {
  const summary = validateSummary(input?.summary);
  if (!summary) return { ok: false, status: 400, error: "A valid scan summary is required." };
  const serialized = serializeSummary(summary);
  if (serialized.length > MAX_SUMMARY_CHARS) {
    return { ok: false, status: 413, error: "The scan summary is too large to explain." };
  }
  return { ok: true, serialized };
}
async function callGemini(serialized, model, apiKey, fetchFn = fetch) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Explain this scan result:
${serialized}` }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.2 }
    })
  });
  if (!response.ok) throw new Error("The explanation service is unavailable right now.");
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("The explanation service returned an empty response.");
  return text;
}
async function handleExplainHttp(req, res, deps = {}) {
  cors(res);
  if (methodOf(req) === "OPTIONS") {
    res.status(204).json(null);
    return;
  }
  if (methodOf(req) !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  if (tooLarge(req, MAX_SUMMARY_CHARS + 2048)) {
    res.status(413).json({ error: "Request body is too large." });
    return;
  }
  const env = deps.env ?? process.env;
  const ip = clientIp(req.headers ?? {}, req.socket?.remoteAddress ?? "unknown");
  if (!allow(`explain:${ip}`, EXPLAIN_LIMIT, EXPLAIN_WINDOW_MS, deps.now ?? Date.now())) {
    res.status(429).json({ error: "Too many explanation requests. Please wait a minute and try again." });
    return;
  }
  const key = getGeminiApiKey(env);
  if (!key) {
    res.status(503).json({ error: "The optional AI explanation is not configured on this deployment." });
    return;
  }
  const body = readJsonBody(req);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }
  const prepared = prepareExplainPayload(body.value);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  try {
    const generate = deps.generate ?? callGemini;
    const model = getModelId(env);
    const text = await generate(prepared.serialized, model, key);
    res.status(200).json({ explanation: text, model });
  } catch {
    res.status(502).json({ error: "The explanation could not be generated. Please try again in a moment." });
  }
}

// server/explain.ts
var maxDuration = 30;
async function handler(req, res) {
  await handleExplainHttp(req, res);
}
export {
  handler as default,
  maxDuration
};
