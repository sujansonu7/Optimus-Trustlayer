"use client";

import { useMemo, useState } from "react";
import type { Conflict, Severity } from "@/lib/conflicts/detect";

const SEV_STYLE: Record<Severity, { chip: string; ring: string; label: string }> = {
  critical: {
    chip: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    ring: "border-red-200 dark:border-red-500/30",
    label: "Critical",
  },
  high: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-500/30",
    label: "High",
  },
  low: {
    chip: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    ring: "border-neutral-200 dark:border-neutral-800",
    label: "Low",
  },
};

const BASIS_LABEL: Record<Conflict["ruleBasis"], string> = {
  declaration: "Declared system of record",
  corroboration: "Corroboration",
  freshness: "Freshness",
  override: "Manual override",
};

function SourceChip({
  label,
  date,
  dim,
}: {
  label: string;
  date: string | null;
  dim: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs " +
        (dim
          ? "border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
          : "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200")
      }
    >
      <span className="font-medium">{label}</span>
      {date && <span className="tabular-nums text-neutral-400">{date.slice(0, 10)}</span>}
    </span>
  );
}

function ConflictCard({ c }: { c: Conflict }) {
  const sev = SEV_STYLE[c.severity];
  return (
    <article
      className={`rounded-xl border ${sev.ring} bg-white p-5 shadow-sm dark:bg-neutral-950`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight">{c.entityLabel}</h3>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {c.attributeLabel}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${sev.chip}`}>
          {sev.label} · cost of being wrong
        </span>
        {c.planted && (
          <span className="ml-auto rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            planted {c.planted.split(" ")[0]}
          </span>
        )}
      </div>

      {/* Every value is shown — the loser is never hidden. */}
      <div className="space-y-2">
        {c.values.map((v, i) => (
          <div
            key={i}
            className={
              "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 " +
              (v.isWinner
                ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/5"
                : "border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40")
            }
          >
            <span className="flex items-center gap-2">
              {v.isWinner ? (
                <span className="text-emerald-600 dark:text-emerald-400" aria-label="winner">
                  ✓
                </span>
              ) : (
                <span className="text-neutral-300 dark:text-neutral-600" aria-label="superseded value">
                  ○
                </span>
              )}
              <span
                className={
                  "text-sm font-semibold " +
                  (v.isWinner ? "" : "text-neutral-500 line-through decoration-neutral-300")
                }
              >
                {v.display}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {v.sources.map((s, j) => (
                <SourceChip key={j} label={s.label} date={s.docTimestamp} dim={!v.isWinner} />
              ))}
            </span>
          </div>
        ))}
      </div>

      {/* The governing rule, as a human sentence. */}
      <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <span className="mr-2 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {BASIS_LABEL[c.ruleBasis]}
        </span>
        {c.rule}
      </div>
    </article>
  );
}

export default function ConflictsClient({ conflicts }: { conflicts: Conflict[] }) {
  const [onlyPlanted, setOnlyPlanted] = useState(false);

  const counts = useMemo(() => {
    const by: Record<Severity, number> = { critical: 0, high: 0, low: 0 };
    for (const c of conflicts) by[c.severity]++;
    return by;
  }, [conflicts]);

  const shown = onlyPlanted ? conflicts.filter((c) => c.planted) : conflicts;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${SEV_STYLE.critical.chip}`}>
          {counts.critical} critical
        </span>
        <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${SEV_STYLE.high.chip}`}>
          {counts.high} high
        </span>
        <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${SEV_STYLE.low.chip}`}>
          {counts.low} low
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-500">
          <input
            type="checkbox"
            checked={onlyPlanted}
            onChange={(e) => setOnlyPlanted(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Only planted conflicts
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          No conflicts detected.
        </div>
      ) : (
        <div className="grid gap-4">
          {shown.map((c) => (
            <ConflictCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
