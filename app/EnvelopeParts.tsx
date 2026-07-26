"use client";

// Reusable envelope pieces — source chips, the passage panel, inline conflict
// blocks, freshness pills — shared by the work-product page and the live agent
// run. These mirror the Ask envelope in AskClient.tsx so a brief's citations look
// and behave exactly like an Ask answer's: click a chip, see the exact passage.
import { useState } from "react";
import type {
  BriefClaim,
  ConflictBlock,
  EvidenceItem,
  FreshnessBadge,
  SourceTool,
} from "@/lib/agent/types";

export const TOOL_STYLE: Record<SourceTool, { short: string; cls: string }> = {
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

/* One cited claim: the statement plus its clickable source chips. */
export function ClaimRow({ claim, byId }: { claim: BriefClaim; byId: Map<number, EvidenceItem> }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const items = claim.evidence.map((id) => byId.get(id)).filter(Boolean) as EvidenceItem[];
  const open = openId != null ? byId.get(openId) ?? null : null;

  return (
    <li className="rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-sm text-neutral-800 dark:text-neutral-100">{claim.text}</span>
        <span className="flex flex-wrap items-center gap-1">
          {items.map((e) => (
            <SourceChip key={e.id} e={e} active={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)} />
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
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-500/30 dark:text-yellow-100">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

const BASIS_LABEL: Record<ConflictBlock["basis"], string> = {
  declaration: "Declared system of record",
  corroboration: "Corroboration",
  freshness: "Freshness",
  override: "Manual override",
};

export function ConflictInline({ c }: { c: ConflictBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
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
                  <span className={"text-sm font-semibold " + (v.isWinner ? "" : "text-neutral-500 line-through decoration-neutral-300")}>
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
                      <span className={"rounded px-1 py-px text-[10px] font-bold " + TOOL_STYLE[s.tool].cls}>{TOOL_STYLE[s.tool].short}</span>
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

export function FreshnessPill({ f }: { f: FreshnessBadge }) {
  return (
    <span
      title={`${f.artifact} · ${f.volatility} volatility · ${f.tier} cost of being wrong${f.note ? " · " + f.note : ""}`}
      className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium " + FRESH_STYLE[f.state]}
    >
      <span className={"rounded px-1 py-px text-[10px] font-bold " + TOOL_STYLE[f.sourceTool].cls}>{TOOL_STYLE[f.sourceTool].short}</span>
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
