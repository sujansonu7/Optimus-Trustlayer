"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AskEnvelope,
  Claim,
  ConflictBlock,
  EvidenceItem,
  FreshnessBadge,
  SourceTool,
} from "@/lib/ask/types";

/* ------------------------------------------------------------------ */
/* Styling maps                                                       */
/* ------------------------------------------------------------------ */

const TOOL_STYLE: Record<SourceTool, { short: string; cls: string }> = {
  crm: { short: "CRM", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  spreadsheet: { short: "Sheet", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  email: { short: "Email", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  calls: { short: "Calls", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

const FRESH_STYLE: Record<FreshnessBadge["state"], string> = {
  fresh: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  aging: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  stale: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
};

function docBase(doc: string): string {
  const parts = doc.split("/");
  return parts[parts.length - 1];
}

/* ------------------------------------------------------------------ */
/* Top-level                                                          */
/* ------------------------------------------------------------------ */

export type Suggested = { question: string; beat: number | null; note: string };

export default function AskClient({
  suggested,
  initialQuestion,
}: {
  suggested: Suggested[];
  initialQuestion?: string;
}) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<AskEnvelope | null>(null);
  const [asked, setAsked] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setAsked(text);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Ask failed (HTTP ${res.status})`);
      setEnv(data as AskEnvelope);
    } catch (e) {
      setEnv(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Deep-link: when the page is opened with ?ask=… (e.g. a proof question from
  // onboarding), submit it automatically so the visitor lands on the envelope.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (initialQuestion && initialQuestion.trim()) {
      autoRan.current = true;
      submit(initialQuestion);
    }
  }, [initialQuestion, submit]);

  return (
    <div className="w-full max-w-3xl">
      {/* Question box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your accounts…"
            autoFocus
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition-colors focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {/* Suggested questions */}
      {!env && !loading && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Try one of these
          </div>
          <div className="flex flex-col gap-2">
            {suggested.map((s) => (
              <button
                key={s.question}
                onClick={() => {
                  setQuestion(s.question);
                  submit(s.question);
                }}
                className="group flex items-start gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/20"
              >
                <span className="mt-0.5 text-neutral-300 transition-colors group-hover:text-blue-500 dark:text-neutral-600">
                  →
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {s.question}
                  </span>
                  {s.note && (
                    <span className="mt-0.5 block text-xs text-neutral-400">
                      {s.beat ? <span className="font-medium text-neutral-400">Beat {s.beat} · </span> : null}
                      {s.note}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-6 animate-pulse rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
          <div className="mb-3 h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="mb-2 h-5 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-5 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Answer envelope */}
      {env && !loading && (
        <div className="mt-6">
          <Envelope env={env} asked={asked} onReask={() => submit(asked)} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The answer envelope (the designed component)                        */
/* ------------------------------------------------------------------ */

function Envelope({ env, asked, onReask }: { env: AskEnvelope; asked: string; onReask: () => void }) {
  const byId = new Map(env.evidence.map((e) => [e.id, e]));

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* Header: the question + meta chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-6 py-3 dark:border-neutral-900">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Answer</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">“{asked}”</span>
        <div className="ml-auto flex items-center gap-2">
          {env.cached ? (
            <span
              title="Served from the belief cache — same question, same evidence set."
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            >
              cached belief
            </span>
          ) : (
            <span
              title="Freshly computed from the connected sources."
              className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
            >
              freshly computed
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5">
        {/* Degraded banner (a declared system-of-record is disconnected) */}
        {env.degraded && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <span aria-hidden>⚠</span>
            <span>{env.degraded}</span>
          </div>
        )}

        {!env.answerable ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            <p className="font-medium text-neutral-700 dark:text-neutral-200">I can’t answer that from the connected sources.</p>
            {env.note && <p className="mt-1">{env.note}</p>}
            {env.disconnectedTools.length > 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                Disconnected right now: {env.disconnectedTools.map((t) => TOOL_STYLE[t].short).join(", ")}. Reconnect on{" "}
                <a href="/admin" className="underline">/admin</a>.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Prose answer */}
            <p className="text-lg leading-relaxed text-neutral-900 dark:text-neutral-50">{env.answer}</p>

            {/* Confidence + freshness row */}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ConfidenceMeter value={env.confidence} label={env.confidenceLabel} />
              <div className="flex flex-wrap items-center gap-1.5">
                {env.freshness.map((f) => (
                  <FreshnessPill key={f.sourceTool} f={f} />
                ))}
              </div>
            </div>

            {/* Inline conflict blocks */}
            {env.conflicts.length > 0 && (
              <div className="mt-5 space-y-2">
                {env.conflicts.map((c, i) => (
                  <ConflictInline key={i} c={c} />
                ))}
              </div>
            )}

            {/* Claims with per-claim source chips */}
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Every claim, with its receipts
              </div>
              <ul className="space-y-2.5">
                {env.claims.map((c, i) => (
                  <ClaimRow key={i} claim={c} byId={byId} />
                ))}
              </ul>
            </div>

            {/* Governing declarations touched */}
            {env.declarations.length > 0 && (
              <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-900">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Governing canon
                </div>
                <ul className="space-y-1">
                  {env.declarations.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                      <span
                        className={
                          "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                          (d.status === "ratified"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400")
                        }
                      >
                        {d.status}
                      </span>
                      <span>{d.statement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {env.note && (
              <p className="mt-4 text-xs text-neutral-400">{env.note}</p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-neutral-100 px-6 py-2.5 text-xs text-neutral-400 dark:border-neutral-900">
        <span>
          Answered from {env.connectedTools.length} connected source
          {env.connectedTools.length === 1 ? "" : "s"}
        </span>
        {env.disconnectedTools.length > 0 && (
          <span className="text-amber-500">
            · {env.disconnectedTools.map((t) => TOOL_STYLE[t].short).join(", ")} disconnected
          </span>
        )}
        <button onClick={onReask} className="ml-auto font-medium text-blue-600 hover:underline dark:text-blue-400">
          Re-ask
        </button>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Claim row + source chips → passage                                 */
/* ------------------------------------------------------------------ */

function ClaimRow({ claim, byId }: { claim: Claim; byId: Map<number, EvidenceItem> }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const items = claim.evidence.map((id) => byId.get(id)).filter(Boolean) as EvidenceItem[];
  const open = openId != null ? byId.get(openId) ?? null : null;

  return (
    <li className="rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-sm text-neutral-800 dark:text-neutral-100">{claim.text}</span>
        <span className="flex flex-wrap items-center gap-1">
          {items.map((e) => (
            <SourceChip
              key={e.id}
              e={e}
              active={openId === e.id}
              onClick={() => setOpenId(openId === e.id ? null : e.id)}
            />
          ))}
        </span>
      </div>
      {open && <PassagePanel e={open} />}
    </li>
  );
}

function SourceChip({ e, active, onClick }: { e: EvidenceItem; active: boolean; onClick: () => void }) {
  const st = TOOL_STYLE[e.sourceTool];
  return (
    <button
      onClick={onClick}
      title="Show the exact source passage"
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
        (active
          ? "border-blue-400 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600")
      }
    >
      <span className={"rounded px-1 py-px text-[10px] font-bold " + st.cls}>{st.short}</span>
      <span className="max-w-[10rem] truncate font-mono text-neutral-500 dark:text-neutral-400">{docBase(e.sourceDoc)}</span>
      {e.docTimestamp && <span className="tabular-nums text-neutral-400">{e.docTimestamp.slice(0, 10)}</span>}
    </button>
  );
}

function PassagePanel({ e }: { e: EvidenceItem }) {
  const [docText, setDocText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canViewInSource = e.sourceTool === "email" || e.sourceTool === "calls";

  async function loadDoc() {
    if (docText || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/source?doc=${encodeURIComponent(e.sourceDoc)}`);
      if (!res.ok) throw new Error(`Couldn't load source (HTTP ${res.status})`);
      setDocText(await res.text());
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 sm:grid-cols-4">
        <Meta label="Source" value={e.sourceLabel} />
        <Meta label="Document" value={e.sourceDoc} mono />
        <Meta label="Dated" value={e.docTimestamp ? e.docTimestamp.slice(0, 10) : "—"} />
        <Meta label="Hash" value={e.contentHash.slice(0, 10) + "…"} mono />
      </dl>
      <blockquote className="rounded-md border-l-4 border-blue-400 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
        {e.sourceQuote ?? <span className="text-neutral-400">(passage not recorded)</span>}
      </blockquote>
      {canViewInSource && (
        <div>
          {!docText && (
            <button
              onClick={loadDoc}
              disabled={loading}
              className="text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              {loading ? "Loading…" : "Show in source document"}
            </button>
          )}
          {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}
          {docText && (
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 font-sans text-[11px] leading-relaxed text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
              <Highlighted text={docText} quote={e.sourceQuote} offset={e.sourceOffset} />
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function Highlighted({ text, quote, offset }: { text: string; quote: string | null; offset: number | null }) {
  if (!quote) return <>{text}</>;
  const start =
    offset != null && offset >= 0 && text.substr(offset, quote.length) === quote ? offset : text.indexOf(quote);
  if (start === -1) return <>{text}</>;
  const end = start + quote.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-500/30 dark:text-yellow-100">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Inline conflict block — calm by default, proof one click away      */
/* ------------------------------------------------------------------ */

const BASIS_LABEL: Record<ConflictBlock["basis"], string> = {
  declaration: "Declared system of record",
  corroboration: "Corroboration",
  freshness: "Freshness",
  override: "Manual override",
};

function ConflictInline({ c }: { c: ConflictBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="text-amber-600 dark:text-amber-400" aria-hidden>⚠</span>
        <span className="text-neutral-700 dark:text-neutral-200">
          Sources disagree on <span className="font-medium">{c.entity}</span>’s {c.attributeLabel} — showing{" "}
          <span className="font-semibold">{c.winnerDisplay}</span>
        </span>
        <span className="ml-auto text-xs text-neutral-400">{open ? "Hide proof ▲" : "Show proof ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-amber-200 px-3 py-3 dark:border-amber-500/30">
          <div className="space-y-1.5">
            {c.values.map((v, i) => (
              <div
                key={i}
                className={
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2.5 py-1.5 " +
                  (v.isWinner
                    ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/5"
                    : "border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-900/40")
                }
              >
                <span className="flex items-center gap-1.5">
                  <span className={v.isWinner ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-300 dark:text-neutral-600"}>
                    {v.isWinner ? "✓" : "○"}
                  </span>
                  <span
                    className={
                      "text-sm font-semibold " +
                      (v.isWinner ? "" : "text-neutral-500 line-through decoration-neutral-300")
                    }
                  >
                    {v.display}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {v.sources.map((s, j) => (
                    <span
                      key={j}
                      className={
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] " +
                        (v.isWinner
                          ? "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                          : "border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400")
                      }
                    >
                      <span className={"rounded px-1 py-px text-[10px] font-bold " + TOOL_STYLE[s.tool].cls}>
                        {TOOL_STYLE[s.tool].short}
                      </span>
                      {s.date && <span className="tabular-nums text-neutral-400">{s.date.slice(0, 10)}</span>}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-md bg-white/70 p-2.5 text-xs text-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300">
            <span className="mr-2 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {BASIS_LABEL[c.basis]}
            </span>
            {c.rule}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small bits                                                         */
/* ------------------------------------------------------------------ */

function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = label === "High" ? "bg-emerald-500" : label === "Medium" ? "bg-amber-500" : "bg-orange-500";
  const text = label === "High" ? "text-emerald-700 dark:text-emerald-400" : label === "Medium" ? "text-amber-700 dark:text-amber-400" : "text-orange-700 dark:text-orange-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Confidence</span>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className={"h-full rounded-full transition-all " + color} style={{ width: `${pct}%` }} />
      </div>
      <span className={"text-xs font-semibold " + text}>
        {label} · {pct}%
      </span>
    </div>
  );
}

function FreshnessPill({ f }: { f: FreshnessBadge }) {
  return (
    <span
      title={`${f.artifact} · ${f.volatility} volatility · ${f.tier} cost of being wrong${f.note ? " · " + f.note : ""}`}
      className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium " + FRESH_STYLE[f.state]}
    >
      <span className={"rounded px-1 py-px text-[10px] font-bold " + TOOL_STYLE[f.sourceTool].cls}>
        {TOOL_STYLE[f.sourceTool].short}
      </span>
      {f.ageText}
      {f.real && <span title="computed from the real last-modified time" aria-hidden>•live</span>}
    </span>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-neutral-400">{label}</dt>
      <dd className={"text-neutral-700 dark:text-neutral-300 " + (mono ? "font-mono" : "")}>{value}</dd>
    </div>
  );
}
