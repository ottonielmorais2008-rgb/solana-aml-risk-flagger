import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DEMO_ADDRESS, loadDemoSnapshot } from "./lib/demo";
import { analyzeWallet } from "./lib/detect";
import {
  addressUrl,
  FLAG_LABEL,
  formatDate,
  formatDay,
  formatSol,
  RISK_LABEL,
  shortAddress,
  txUrl,
} from "./lib/format";
import { DEFAULT_SIGNATURE_LIMIT, loadHistory } from "./lib/history";
import { summarize } from "./lib/summary";
import type { HistoryPage, RiskFlag } from "./lib/types";
import { initialAddress, validateInput } from "./lib/ui-state";

const REPO_URL = "https://github.com/ottonielmorais2008-rgb/solana-aml-risk-flagger";

type Source = { kind: "live" } | { kind: "snapshot"; savedAt: string };

interface ScanState extends HistoryPage {
  address: string;
  source: Source;
}

function FlagCard({ flag }: { flag: RiskFlag }) {
  return (
    <article className={`card suspect sev-${flag.severity}`}>
      <header className="suspect-head">
        <span className={`pill sev-${flag.severity}`}>{flag.severity}</span>
        <h3>{flag.title}</h3>
        {<span className="muted small">{flag.txSignatures.length} evidence transaction{flag.txSignatures.length === 1 ? "" : "s"}</span>}
      </header>
      <p className="reasons">{flag.detail}</p>
      {flag.counterparty && (
        <p className="small">
          Counterparty:{" "}
          <a href={addressUrl(flag.counterparty)} target="_blank" rel="noreferrer" className="mono">
            {shortAddress(flag.counterparty)}
          </a>
        </p>
      )}
      <p className="small muted evidence-label">Evidence on Solana Explorer</p>
      <ul className="evidence">
        {flag.txSignatures.slice(0, 8).map((sig) => (
          <li key={sig}>
            <a href={txUrl(sig)} target="_blank" rel="noreferrer" className="mono">
              {shortAddress(sig, 8, 6)}
            </a>
          </li>
        ))}
        {flag.txSignatures.length > 8 && (
          <li className="muted small">+{flag.txSignatures.length - 8} more</li>
        )}
      </ul>
    </article>
  );
}

export function App() {
  const start = useMemo(() => initialAddress(window.location.search), []);
  const [input, setInput] = useState(start.address);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const requestId = useRef(0);

  const analysis = useMemo(
    () => (scan ? analyzeWallet(scan.address, scan.transactions, scan.transfers) : null),
    [scan],
  );

  const runScan = useCallback(async (address: string, options: { keepOnError?: boolean; before?: string } = {}) => {
    const id = ++requestId.current;
    setLoading("Reading recent transactions from a public Solana RPC…");
    setError(null);
    if (!options.before) {
      setExplanation(null);
      setExplainError(null);
    }
    try {
      const result = await loadHistory(address, {
        limit: DEFAULT_SIGNATURE_LIMIT,
        before: options.before,
        onProgress: (done, total) => {
          if (id === requestId.current) setLoading(`Read ${done} of ${total} transactions…`);
        },
      });
      if (id !== requestId.current) return;
      setScan((current) => {
        if (options.before && current && current.address === address) {
          return {
            address,
            transactions: [...current.transactions, ...result.transactions],
            transfers: [...current.transfers, ...result.transfers],
            nextBefore: result.nextBefore,
            source: { kind: "live" },
          };
        }
        return { address, ...result, source: { kind: "live" } };
      });
      const url = new URL(window.location.href);
      if (address === DEMO_ADDRESS) url.searchParams.delete("address");
      else url.searchParams.set("address", address);
      window.history.replaceState(null, "", url);
    } catch (e) {
      if (id !== requestId.current) return;
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(options.keepOnError ? `Live refresh failed: ${message} Showing the saved snapshot.` : message);
      if (!options.keepOnError && !options.before) setScan(null);
    } finally {
      if (id === requestId.current) setLoading(null);
    }
  }, []);

  useEffect(() => {
    if (start.isDemo) {
      const demo = loadDemoSnapshot();
      setScan({
        address: demo.address,
        transactions: demo.transactions,
        transfers: demo.transfers,
        nextBefore: demo.nextBefore,
        source: { kind: "snapshot", savedAt: demo.savedAt },
      });
      void runScan(DEMO_ADDRESS, { keepOnError: true });
    } else {
      void runScan(start.address);
    }
  }, [start, runScan]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const checked = validateInput(input);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    void runScan(checked.address);
  };

  const explain = async () => {
    if (!analysis) return;
    setExplaining(true);
    setExplainError(null);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summarize(analysis) }),
      });
      const body = (await response.json().catch(() => ({}))) as { explanation?: string; error?: string };
      if (!response.ok || !body.explanation) throw new Error(body.error ?? "The explanation is not available right now.");
      setExplanation(body.explanation);
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : "The explanation is not available right now.");
    } finally {
      setExplaining(false);
    }
  };

  const shownTransfers = analysis
    ? (onlyFlagged ? analysis.transfers.filter((t) => t.flags.length > 0) : analysis.transfers).slice(0, 200)
    : [];

  return (
    <div className="page">
      <header className="hero">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ⚑
          </span>
          <div>
            <h1>Solana AML Risk Flagger</h1>
            <p className="tagline">
              Paste a public Solana address to flag fast in/out transfers, many small inbound payments, repeated
              counterparties and bursts of activity. Every flag is backed by a transaction signature. These are
              heuristics, not a finding of wrongdoing.
            </p>
          </div>
        </div>
        <div className="badges">
          <span className="badge">Read-only</span>
          <span className="badge">No wallet connection</span>
          <span className="badge">No keys</span>
          <a className="badge link" href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub ↗
          </a>
        </div>
      </header>

      <form className="search card" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Solana wallet address"
          spellCheck={false}
          autoComplete="off"
          aria-label="Solana wallet address"
        />
        <button type="submit" disabled={Boolean(loading)}>
          {loading ? "Scanning…" : "Scan"}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setInput(DEMO_ADDRESS);
            void runScan(DEMO_ADDRESS);
          }}
        >
          Demo address
        </button>
      </form>

      {loading && <p className="status">{loading}</p>}
      {error && <p className="status error">{error}</p>}

      {analysis && scan && (
        <>
          <section className={`card overview sev-${analysis.risk}`}>
            <div className="overview-main">
              <div>
                <p className="muted small">
                  {scan.address === DEMO_ADDRESS ? "Demo: a real mainnet address whose recent transfers trigger the rules · " : ""}
                  {scan.source.kind === "live"
                    ? "Live data"
                    : `Saved snapshot from ${formatDate(Date.parse(scan.source.savedAt) / 1000)}`}
                </p>
                <h2 className="mono break">{scan.address}</h2>
                <p className="muted small">
                  {analysis.transactionsScanned} recent transactions · {analysis.transfersScanned} native SOL transfers ·{" "}
                  {formatDay(analysis.oldest)} → {formatDay(analysis.newest)}
                </p>
              </div>
              <div className={`risk sev-${analysis.risk}`}>
                <span className="small">Heuristic risk</span>
                <strong>{RISK_LABEL[analysis.risk]}</strong>
              </div>
            </div>
            <div className="stats">
              <div>
                <strong>{analysis.flags.length}</strong>
                <span>flags</span>
              </div>
              <div>
                <strong>{formatSol(analysis.inboundLamports)}</strong>
                <span>SOL in</span>
              </div>
              <div>
                <strong>{formatSol(analysis.outboundLamports)}</strong>
                <span>SOL out</span>
              </div>
              <div>
                <strong>{analysis.counts["fast-in-out"]}</strong>
                <span>fast in/out flags</span>
              </div>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void explain()} disabled={explaining || !analysis.flags.length}>
                {explaining ? "Explaining…" : "Explain with AI"}
              </button>
              {scan.nextBefore && (
                <button
                  type="button"
                  className="ghost"
                  disabled={Boolean(loading)}
                  onClick={() => void runScan(scan.address, { before: scan.nextBefore ?? undefined })}
                >
                  Load older transactions
                </button>
              )}
            </div>
            {explainError && <p className="status error">{explainError}</p>}
            {explanation && (
              <div className="explanation">
                {explanation.split(/\n\n+/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            )}
          </section>

          <div className="grid">
            <div className="findings">
              <h3>{analysis.flags.length ? "Flags" : "No flags in this window"}</h3>
              {analysis.flags.length === 0 && (
                <p className="muted">
                  None of the four rules fired on the recent native SOL transfers that were scanned. This is not a
                  guarantee that the wallet is safe.
                </p>
              )}
              {analysis.flags.map((flag) => (
                <FlagCard key={flag.id} flag={flag} />
              ))}
            </div>
            <aside className="card trusted">
              <h3>How the rules work</h3>
              <ul>
                <li>
                  <strong>Fast in/out</strong>
                  <span className="muted small">Similar amount sent onwards within 15 minutes.</span>
                </li>
                <li>
                  <strong>Many small inbound transfers</strong>
                  <span className="muted small">5 or more inbound transfers of 0.05 SOL or less, from at least 3 counterparties.</span>
                </li>
                <li>
                  <strong>Repeated counterparty</strong>
                  <span className="muted small">The same address appears in 4 or more SOL transfers.</span>
                </li>
                <li>
                  <strong>Burst of activity</strong>
                  <span className="muted small">8 or more successful transactions in 10 minutes.</span>
                </li>
              </ul>
              <h3>Limits</h3>
              <ul className="tips">
                <li>Only native SOL transfers, including inner instructions. Tokens are ignored.</li>
                <li>Only the most recent transactions are scanned ({DEFAULT_SIGNATURE_LIMIT} at a time).</li>
                <li>The same patterns can have innocent explanations. This is not a legal or compliance opinion.</li>
                <li>No wallet is connected and nothing is signed.</li>
              </ul>
            </aside>
          </div>

          <section className="card">
            <div className="table-head">
              <h3>SOL transfers</h3>
              <label className="small">
                <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Only
                flagged
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Dir</th>
                    <th className="num">Amount</th>
                    <th>Counterparty</th>
                    <th>Flags</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shownTransfers.map((t) => (
                    <tr key={`${t.transfer.signature}:${t.transfer.index}`} className={t.flags.length ? "flagged" : ""}>
                      <td className="nowrap small">{formatDate(t.transfer.blockTime ?? undefined)}</td>
                      <td>
                        <span className={`dir dir-${t.direction}`}>{t.direction === "in" ? "IN" : "OUT"}</span>
                      </td>
                      <td className="num mono">{formatSol(t.transfer.lamports)}</td>
                      <td>
                        <a href={addressUrl(t.counterparty)} target="_blank" rel="noreferrer" className="mono">
                          {shortAddress(t.counterparty)}
                        </a>
                        {t.transfer.inner && <span className="muted small"> inner</span>}
                      </td>
                      <td>
                        <span className="chips">
                          {t.flags.map((flag) => (
                            <span key={flag} className={`chip chip-${flag}`}>
                              {FLAG_LABEL[flag]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <a href={txUrl(t.transfer.signature)} target="_blank" rel="noreferrer" className="mono small">
                          tx
                        </a>
                      </td>
                    </tr>
                  ))}
                  {shownTransfers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">
                        No SOL transfers to show in this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="footer small muted">
        <p>
          Data: public Solana RPC (mainnet-beta, with a public fallback), read in your browser. Nothing is signed and no
          wallet is connected. Only native SOL transfers in the most recent transactions are checked. Flags are simple heuristics; they are not a finding of money laundering.
        </p>
      </footer>
    </div>
  );
}
