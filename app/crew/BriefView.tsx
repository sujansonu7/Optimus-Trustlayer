"use client";

// Renders an assembled crew brief — THE PRODUCT of the assembly step. Goal, the
// arbitrated relevant context (each line cited, click a chip to see the exact
// passage), constraints, done-criteria, plus the envelope (conflicts, freshness,
// governing canon). Reuses the same citation UX as an Ask answer and a work
// product, so a brief reads consistently with everything else in TrustLayer.
import type { CrewBrief } from "@/lib/crew/types";
import { ClaimRow, ConflictInline, FreshnessPill, TOOL_STYLE } from "../EnvelopeParts";

export default function BriefView({ brief }: { brief: CrewBrief }) {
  const byId = new Map(brief.evidence.map((e) => [e.id, e]));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      {/* Goal */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Goal</div>
        <p className="mt-0.5 text-sm text-neutral-800 dark:text-neutral-100">{brief.goal}</p>
      </div>

      {/* Constraints + done-criteria, side by side when both present */}
      {(brief.constraints.length > 0 || brief.doneCriteria.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {brief.constraints.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Constraints</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
                {brief.constraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.doneCriteria.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Done when</div>
              <ul className="mt-1 space-y-0.5 text-sm text-neutral-700 dark:text-neutral-300">
                {brief.doneCriteria.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-neutral-300 dark:text-neutral-600" aria-hidden>
                      ☐
                    </span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Arbitrated relevant context, each line cited */}
      <div className="mt-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Relevant context from the graph · every line cited
        </div>
        {brief.context.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            {brief.note ?? "No matching context was found in the connected graph."}
          </p>
        ) : (
          <ul className="space-y-2">
            {brief.context.map((c, i) => (
              <ClaimRow key={i} claim={c} byId={byId} />
            ))}
          </ul>
        )}
      </div>

      {/* Freshness of contributing sources */}
      {brief.freshness.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Freshness</span>
          {brief.freshness.map((f) => (
            <FreshnessPill key={f.sourceTool} f={f} />
          ))}
        </div>
      )}

      {/* Conflicts touched */}
      {brief.conflicts.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Conflicts noted</div>
          <div className="space-y-2">
            {brief.conflicts.map((c, i) => (
              <ConflictInline key={i} c={c} />
            ))}
          </div>
        </div>
      )}

      {/* Governing canon */}
      {brief.declarations.length > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-900">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Governing canon</div>
          <ul className="space-y-1">
            {brief.declarations.map((d, i) => (
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

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 border-t border-neutral-100 pt-2 text-[11px] text-neutral-400 dark:border-neutral-900">
        <span>
          {brief.context.length} context line{brief.context.length === 1 ? "" : "s"} · {brief.evidence.length} source
          passage{brief.evidence.length === 1 ? "" : "s"}
        </span>
        <span>
          · from {brief.connectedTools.length} connected source{brief.connectedTools.length === 1 ? "" : "s"}
        </span>
        {brief.disconnectedTools.length > 0 && (
          <span className="text-amber-500">
            · {brief.disconnectedTools.map((t) => TOOL_STYLE[t].short).join(", ")} disconnected
          </span>
        )}
      </div>
    </div>
  );
}
