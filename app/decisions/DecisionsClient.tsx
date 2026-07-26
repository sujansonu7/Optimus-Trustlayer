"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DecisionView, DecisionKind } from "@/lib/decisions";
import { revertDecisionAction, restoreDecisionAction } from "./actions";

type SourceTool = "crm" | "spreadsheet" | "email" | "calls";

const TOOL_STYLE: Record<SourceTool, { short: string; cls: string }> = {
  crm: { short: "CRM", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  spreadsheet: { short: "Sheet", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  email: { short: "Email", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  calls: { short: "Calls", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

const KIND_META: Record<DecisionKind, { label: string; cls: string; blurb: string }> = {
  arbitration: {
    label: "Arbitration",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    blurb: "A source disagreement TrustLayer settled. Revert flips the answer to the value it rejected.",
  },
  merge: {
    label: "Merge",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    blurb: "Alias names resolved into one identity. Revert splits the alias back out.",
  },
  classification: {
    label: "Classification",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    blurb: "An email/call line typed as a fact. Revert supersedes just that fact.",
  },
};

type Filter = "all" | DecisionKind;

export default function DecisionsClient({ initial }: { initial: DecisionView[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<DecisionView[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: rows.length, merge: 0, classification: 0, arbitration: 0 } as Record<Filter, number>;
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  const revertedCount = rows.filter((r) => r.reverted_at).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.kind === filter);

  function act(row: DecisionView, kind: "revert" | "restore") {
    setBusyId(row.id);
    setFlash(null);
    startTransition(async () => {
      try {
        const res = kind === "revert" ? await revertDecisionAction(row.id) : await restoreDecisionAction(row.id);
        // Optimistic local flip, then reconcile with the server.
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, reverted_at: kind === "revert" ? new Date(0).toISOString() : null }
              : r
          )
        );
        setFlash(res.summary);
        router.refresh();
      } catch (err) {
        setFlash(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    });
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "arbitration", label: `Arbitrations (${counts.arbitration})` },
    { key: "merge", label: `Merges (${counts.merge})` },
    { key: "classification", label: `Classifications (${counts.classification})` },
  ];

  return (
    <div>
      {/* Summary */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{rows.length}</span> automatic
          decisions
        </span>
        {revertedCount > 0 && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
            {revertedCount} overridden by you
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                "rounded-full px-3 py-1 text-sm font-medium transition-colors " +
                (active
                  ? "bg-blue-600 text-white"
                  : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {flash && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          {flash}
        </div>
      )}

      <ul className="space-y-2.5">
        {shown.map((r) => (
          <DecisionCard key={r.id} r={r} busy={pending && busyId === r.id} onAct={act} />
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="text-sm text-neutral-400">No decisions of this kind.</p>
      )}
    </div>
  );
}

function DecisionCard({
  r,
  busy,
  onAct,
}: {
  r: DecisionView;
  busy: boolean;
  onAct: (r: DecisionView, kind: "revert" | "restore") => void;
}) {
  const meta = KIND_META[r.kind];
  const reverted = !!r.reverted_at;

  return (
    <li
      className={
        "rounded-xl border px-4 py-3 transition-colors " +
        (reverted
          ? "border-orange-300 bg-orange-50/50 dark:border-orange-500/40 dark:bg-orange-500/5"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={"rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " + meta.cls}>
          {meta.label}
        </span>
        {r.entity_label && (
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{r.entity_label}</span>
        )}
        {r.kind === "arbitration" && r.attributeLabel && (
          <span className="text-sm text-neutral-500 dark:text-neutral-400">· {r.attributeLabel}</span>
        )}
        {reverted && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
            reverted
          </span>
        )}

        {/* Action */}
        <div className="ml-auto">
          {reverted ? (
            <button
              onClick={() => onAct(r, "restore")}
              disabled={busy}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              {busy ? "Restoring…" : "Restore decision"}
            </button>
          ) : (
            <button
              onClick={() => onAct(r, "revert")}
              disabled={busy}
              className="rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50 dark:border-orange-500/40 dark:bg-transparent dark:text-orange-300 dark:hover:bg-orange-500/10"
            >
              {busy ? "Reverting…" : "Revert"}
            </button>
          )}
        </div>
      </div>

      {/* Kind-specific detail */}
      {r.kind === "arbitration" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <ValueChip label="Chose" value={r.winner_value} chosen />
          <span className="text-neutral-300 dark:text-neutral-600">vs</span>
          <ValueChip label="Rejected" value={r.loser_value} />
          {r.basis && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {r.basis}
            </span>
          )}
        </div>
      )}

      {r.kind === "merge" && r.member_tool && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className={"rounded px-1 py-px text-[10px] font-bold " + TOOL_STYLE[r.member_tool].cls}>
            {TOOL_STYLE[r.member_tool].short}
          </span>
          <span className="font-mono text-neutral-700 dark:text-neutral-200">“{r.member_raw}”</span>
          <span className="text-neutral-400">→ folded into</span>
          <span className="font-medium text-neutral-700 dark:text-neutral-200">{r.entity_label}</span>
        </div>
      )}

      {r.kind === "classification" && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {r.source_tool && (
              <span className={"rounded px-1 py-px text-[10px] font-bold " + TOOL_STYLE[r.source_tool].cls}>
                {TOOL_STYLE[r.source_tool].short}
              </span>
            )}
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {r.classified_as}
            </span>
            {r.source_doc && (
              <span className="font-mono text-xs text-neutral-400">{docBase(r.source_doc)}</span>
            )}
          </div>
          {r.source_quote && (
            <blockquote className="rounded-md border-l-4 border-blue-400 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
              {r.source_quote}
            </blockquote>
          )}
        </div>
      )}

      {/* Why */}
      <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        <span className="font-medium text-neutral-600 dark:text-neutral-300">Why: </span>
        {r.why}
      </p>
    </li>
  );
}

function ValueChip({ label, value, chosen }: { label: string; value: string | null; chosen?: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm " +
        (chosen
          ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/5"
          : "border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-900/40")
      }
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</span>
      <span
        className={
          "font-semibold " + (chosen ? "text-emerald-700 dark:text-emerald-300" : "text-neutral-500 line-through decoration-neutral-300")
        }
      >
        {value ?? "—"}
      </span>
    </span>
  );
}

function docBase(doc: string): string {
  const parts = doc.split("/");
  return parts[parts.length - 1];
}
