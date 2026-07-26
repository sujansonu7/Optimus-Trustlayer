"use client";

// Renders a work product: a formatted brief whose every claim carries envelope
// citations. Used both inline right after the agent finishes a run, and on the
// /library/[id] page. Same citation UX as an Ask answer — click a source chip to
// see the exact passage, its date, and its content hash.
import type { WorkProduct, Computation, EvidenceItem } from "@/lib/agent/types";
import { TOOL_STYLE, ClaimRow, ConflictInline, FreshnessPill, EvidenceChips } from "./EnvelopeParts";

// Format a timestamp deterministically — fixed locale + UTC — so the server and
// client render the exact same string (a plain toLocaleString() uses each
// environment's locale/timezone and causes a React hydration mismatch).
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC"
  );
}

export default function WorkProductView({
  wp,
  meta,
}: {
  wp: WorkProduct;
  meta?: { createdAt?: string };
}) {
  const byId = new Map(wp.evidence.map((e) => [e.id, e]));
  const totalClaims = wp.sections.reduce((n, s) => n + s.claims.length, 0);
  const when = meta?.createdAt ?? wp.generatedAt;

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* Header */}
      <div className="border-b border-neutral-100 px-6 py-4 dark:border-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            Work product
          </span>
          {wp.entity && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {wp.entity}
            </span>
          )}
          <span className="ml-auto text-[11px] text-neutral-400">{when ? formatWhen(when) : ""}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">{wp.title}</h1>
        <p className="mt-1 text-xs text-neutral-400">
          In response to: <span className="italic">“{wp.request}”</span>
        </p>
      </div>

      <div className="px-6 py-5">
        {/* Executive summary */}
        {wp.summary && <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-100">{wp.summary}</p>}

        {/* Risk flags */}
        {wp.risks.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Flags</div>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800 dark:text-amber-200">
              {wp.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Freshness of contributing sources */}
        {wp.freshness.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Freshness</span>
            {wp.freshness.map((f) => (
              <FreshnessPill key={f.sourceTool} f={f} />
            ))}
          </div>
        )}

        {/* Body: sections of cited claims */}
        {wp.sections.length === 0 ? (
          <p className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            The agent could not assemble any cited claims from the connected sources.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {wp.sections.map((s, i) => (
              <section key={i}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {s.heading}
                </h2>
                <ul className="space-y-2.5">
                  {s.claims.map((c, j) => (
                    <ClaimRow key={j} claim={c} byId={byId} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Computations: the code the agent ran, its output, and its charts */}
        {wp.computations && wp.computations.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Computed in a sandbox · code, output, and every number’s source
            </div>
            <div className="space-y-4">
              {wp.computations.map((c, i) => (
                <ComputationCard key={i} c={c} byId={byId} />
              ))}
            </div>
          </div>
        )}

        {/* Conflicts touched by the brief */}
        {wp.conflicts.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Conflicts noted</div>
            <div className="space-y-2">
              {wp.conflicts.map((c, i) => (
                <ConflictInline key={i} c={c} />
              ))}
            </div>
          </div>
        )}

        {/* Governing declarations */}
        {wp.declarations.length > 0 && (
          <div className="mt-6 border-t border-neutral-100 pt-4 dark:border-neutral-900">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">Governing canon</div>
            <ul className="space-y-1">
              {wp.declarations.map((d, i) => (
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
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-100 px-6 py-2.5 text-xs text-neutral-400 dark:border-neutral-900">
        <span>
          {totalClaims} cited claim{totalClaims === 1 ? "" : "s"} · {wp.evidence.length} source passage
          {wp.evidence.length === 1 ? "" : "s"}
        </span>
        <span>
          · from {wp.connectedTools.length} connected source{wp.connectedTools.length === 1 ? "" : "s"}
        </span>
        {wp.computations && wp.computations.length > 0 && (
          <span>· {wp.computations.length} computation{wp.computations.length === 1 ? "" : "s"}</span>
        )}
        {wp.disconnectedTools.length > 0 && (
          <span className="text-amber-500">· {wp.disconnectedTools.map((t) => TOOL_STYLE[t].short).join(", ")} disconnected</span>
        )}
      </div>
    </article>
  );
}

// One computation: the exact Python that ran, what it printed, the charts it
// drew, and the source passages behind the numbers. This is the audit trail for
// every computed figure — nothing here is unbacked.
function ComputationCard({ c, byId }: { c: Computation; byId: Map<number, EvidenceItem> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2 dark:border-neutral-900 dark:bg-neutral-900/50">
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-100 dark:bg-neutral-700">
          {c.runner}
        </span>
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{c.label}</span>
        <span className="ml-auto text-[11px] text-neutral-400">ran in {(c.durationMs / 1000).toFixed(1)}s</span>
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* Charts */}
        {c.charts.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {c.charts.map((ch, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`data:${ch.mime};base64,${ch.base64}`}
                alt={`${c.label} chart ${i + 1}`}
                className="max-w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
              />
            ))}
          </div>
        )}

        {/* The code */}
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
            Show the Python that ran ▾
          </summary>
          <pre className="mt-1.5 max-h-80 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-[11px] leading-relaxed text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
            {c.code}
          </pre>
        </details>

        {/* stdout */}
        {c.stdout.trim() && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Output</div>
            <pre className="max-h-72 overflow-auto rounded-md border border-neutral-200 bg-neutral-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-200 dark:border-neutral-800">
              {c.stdout.trim()}
            </pre>
          </div>
        )}

        {/* Error, if the run failed */}
        {c.error && (
          <pre className="max-h-56 overflow-auto rounded-md border border-red-300 bg-red-50 p-3 font-mono text-[11px] text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {c.error}
          </pre>
        )}

        {/* Sources behind the numbers */}
        {c.evidenceIds.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Sources behind these numbers
            </div>
            <EvidenceChips ids={c.evidenceIds} byId={byId} />
          </div>
        )}
      </div>
    </div>
  );
}
