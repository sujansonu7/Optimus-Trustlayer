"use client";

import { useIngestStream, type SourceTool, type FileCard } from "@/lib/useIngestStream";

const TOOL_STYLE: Record<SourceTool, { label: string; cls: string }> = {
  crm: { label: "CRM", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  spreadsheet: { label: "Sheet", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  email: { label: "Email", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  calls: { label: "Calls", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

export default function AdminClient({
  initialFactCount,
  initialFileCount,
}: {
  initialFactCount: number | null;
  initialFileCount: number | null;
}) {
  const { running, totalDocs, budgetUsd, setBudgetUsd, cards, counts, banner, run } =
    useIngestStream({ defaultBudget: 3 });

  const budgetPct = Math.min(100, (counts.cost / (budgetUsd || 1)) * 100);
  const progressPct = totalDocs ? Math.min(100, ((counts.done + counts.skipped) / totalDocs) * 100) : 0;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(false)}
          disabled={running}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Ingesting…" : "Ingest fixture"}
        </button>
        <button
          onClick={() => run(true)}
          disabled={running}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
          title="Re-ingest every file, ignoring the content-hash cache"
        >
          Force re-ingest
        </button>
        <label className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          Budget $
          <input
            type="number"
            min={0}
            step={0.5}
            value={budgetUsd}
            disabled={running}
            onChange={(e) => setBudgetUsd(Number(e.target.value))}
            className="w-16 rounded border border-neutral-300 bg-white px-1.5 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {initialFileCount !== null && !running && cards.length === 0 && (
          <span className="text-sm text-neutral-400">
            {initialFactCount} facts stored · {initialFileCount} files ingested
          </span>
        )}
      </div>

      {/* Live counters */}
      {(running || cards.length > 0) && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Facts" value={counts.facts} />
          <Stat label="Files done" value={`${counts.done + counts.skipped} / ${totalDocs}`} />
          <Stat label="Skipped (cached)" value={counts.skipped} />
          <Stat label="Cost" value={`$${counts.cost.toFixed(3)}`} sub={`of $${budgetUsd.toFixed(2)}`} />
        </div>
      )}

      {/* Progress bars */}
      {(running || cards.length > 0) && (
        <div className="mt-3 space-y-2">
          <Bar pct={progressPct} cls="bg-blue-500" label={`${Math.round(progressPct)}% of files`} />
          <Bar pct={budgetPct} cls={budgetPct > 90 ? "bg-red-500" : "bg-emerald-500"} label={`${Math.round(budgetPct)}% of budget`} />
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={
            "mt-5 rounded-md border px-4 py-3 text-sm " +
            (banner.kind === "done"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              : banner.kind === "budget"
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300")
          }
        >
          {banner.text}
          {banner.kind === "done" && (
            <>
              {" "}
              <a href="/facts" className="font-semibold underline">
                Open /facts
              </a>
            </>
          )}
        </div>
      )}

      {/* Per-file log */}
      {cards.length > 0 && (
        <ul className="mt-5 space-y-2">
          {cards.map((c) => (
            <li
              key={c.doc}
              className="rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={"rounded px-1.5 py-0.5 text-xs font-semibold " + TOOL_STYLE[c.tool].cls}>
                  {TOOL_STYLE[c.tool].label}
                </span>
                <span className="font-mono text-sm text-neutral-700 dark:text-neutral-200">{c.doc}</span>
                <StatusPill card={c} />
                <span className="ml-auto text-xs text-neutral-400">
                  {c.status === "skipped"
                    ? `${c.extracted} facts (unchanged)`
                    : c.status === "done"
                    ? `${c.extracted} facts${c.rejected ? ` · ${c.rejected} dropped` : ""}${c.kind === "llm" ? ` · $${c.costUsd.toFixed(4)}` : ""}`
                    : c.status === "error"
                    ? "error"
                    : "…"}
                </span>
              </div>
              {c.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{c.error}</p>}
              {c.facts.length > 0 && (
                <ul className="mt-2 space-y-0.5 pl-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {c.facts.map((f, i) => (
                    <li key={i} className="truncate">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{f.entity}</span>
                      {" · "}
                      {f.attribute} = <span className="text-neutral-700 dark:text-neutral-300">{f.value}</span>
                    </li>
                  ))}
                  {c.status === "done" && c.extracted > c.facts.length && (
                    <li className="text-neutral-400">+ {c.extracted - c.facts.length} more…</li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        {value} {sub && <span className="text-xs font-normal text-neutral-400">{sub}</span>}
      </div>
    </div>
  );
}

function Bar({ pct, cls, label }: { pct: number; cls: string; label: string }) {
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className={"h-full rounded-full transition-all " + cls} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-xs text-neutral-400">{label}</div>
    </div>
  );
}

function StatusPill({ card }: { card: FileCard }) {
  const map = {
    running: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    skipped: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
    error: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  } as const;
  const label = { running: "running", done: "done", skipped: "cached", error: "error" }[card.status];
  return <span className={"rounded px-1.5 py-0.5 text-xs font-medium " + map[card.status]}>{label}</span>;
}
