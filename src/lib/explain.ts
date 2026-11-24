import { allow, clientIp } from "./rate-limit.js";
import { cors, methodOf, readJsonBody, tooLarge, type HttpRequest, type HttpResponse } from "./http.js";
import { MAX_SUMMARY_CHARS, serializeSummary, validateSummary } from "./summary.js";

export type EnvMap = Record<string, string | undefined>;

export const EXPLAIN_LIMIT = 6;
export const EXPLAIN_WINDOW_MS = 60_000;
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export const SYSTEM = `You explain the result of a read-only Solana wallet risk scan, in plain English, for a non-expert.
The scan only applies simple, transparent heuristics to recent public SOL transfers. It is not a finding of money laundering, and a flagged wallet is not necessarily illicit.
Flags in the data:
- "fast-in-out": funds received and a similar amount sent out shortly afterwards.
- "structuring": many small inbound transfers from several counterparties.
- "repeated-counterparty": the same address appears in several transfers.
- "burst": many successful transactions in a short window.
Every flag is already backed by one or more transaction signatures in the data. Refer to those signatures by their first 8 and last 6 characters (Abcdefgh…xyz123). Do not invent signatures, amounts, dates, names or owners.
Rules:
- Use only the supplied data. If a field is missing, do not guess it.
- Explain what each present flag means and why someone might want to inspect the linked transactions. Mention that the same patterns can also have innocent explanations (paying a regular destination, a busy trading session, tips).
- Do not accuse anyone of a crime. Do not give financial, legal or investment advice. Do not tell the reader to send, swap, approve or interact with any account.
- Mention that the scan only covers the recent transactions listed (counts and, when present, the oldest and newest unix timestamps).
- Be concise: 2–4 short paragraphs, no headings, no bullet lists.`;

export function getGeminiApiKey(env: EnvMap = process.env): string | undefined {
  const key = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!key || !key.trim()) return undefined;
  return key.trim();
}

export function getModelId(env: EnvMap = process.env): string {
  return env.GOOGLE_MODEL?.trim() || DEFAULT_MODEL;
}

export function prepareExplainPayload(
  input: unknown,
): { ok: true; serialized: string } | { ok: false; status: number; error: string } {
  const summary = validateSummary((input as { summary?: unknown } | null)?.summary);
  if (!summary) return { ok: false, status: 400, error: "A valid scan summary is required." };
  const serialized = serializeSummary(summary);
  if (serialized.length > MAX_SUMMARY_CHARS) {
    return { ok: false, status: 413, error: "The scan summary is too large to explain." };
  }
  return { ok: true, serialized };
}

export async function callGemini(
  serialized: string,
  model: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Explain this scan result:\n${serialized}` }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
    }),
  });
  if (!response.ok) throw new Error("The explanation service is unavailable right now.");
  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("The explanation service returned an empty response.");
  return text;
}

export async function handleExplainHttp(
  req: HttpRequest,
  res: HttpResponse,
  deps: { env?: EnvMap; generate?: typeof callGemini; now?: number } = {},
): Promise<void> {
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
