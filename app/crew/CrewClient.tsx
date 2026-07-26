"use client";

// /crew — the delegation surface. One box for a messy brain-dump; a triage step
// splits it into outcome-shaped workstreams (trivial items answered inline);
// each workstream shows its assembled, cited brief BEFORE anything runs; the
// owner confirms; then workstreams dispatch to the visible agent one session at a
// time (or two, if the Parallel toggle is on), moving across a kanban ledger.
// Every produced brief gets a one-tap quality verdict that rolls up on /admin.
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { AgentStep, WorkProduct } from "@/lib/agent/types";
import type {
  BriefQuality,
  BriefQualityStats,
  CrewRun,
  CrewStatus,
  CrewWorkstream,
} from "@/lib/crew/types";
import { BOARD_COLUMNS, MAX_PARALLEL, PARALLEL_MIN_RATED, PARALLEL_QUALITY_BAR, parallelUnlocked } from "@/lib/crew/types";
import BriefView from "./BriefView";
import WorkProductView from "../WorkProductView";
import { recordQualityAction, setParallelAction } from "./actions";

/* Mirror of lib/crew/dispatch.ts CrewDispatchEvent — redeclared here so this
 * client bundle never reaches into the server dispatch module. */
type DispatchEvent =
  | { type: "run_status"; status: "triaged" | "dispatching" | "done" }
  | {
      type: "workstream";
      id: string;
      seq: number;
      status: CrewStatus;
      sessionId?: string | null;
      workProductId?: string | null;
      error?: string | null;
    }
  | { type: "step"; workstreamId: string; step: AgentStep }
  | { type: "work_product"; workstreamId: string; id: string; workProduct: WorkProduct }
  | { type: "filed_back"; workstreamId: string; sourceDoc: string }
  | { type: "done" }
  | { type: "error"; message: string };

const EXAMPLE =
  "Prep the Northwind renewal, check the Meridian pricing exception still applies, chase the Coastal contract status, and draft the QBR agenda.";

const STATUS_STYLE: Record<CrewStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  running: { label: "Running", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  needs_input: { label: "Needs input", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  review: { label: "Review", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  inline: { label: "Inline", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
};

export default function CrewClient({
  initialRun,
  parallelEnabled,
  qualityStats,
}: {
  initialRun: CrewRun | null;
  parallelEnabled: boolean;
  qualityStats: BriefQualityStats;
}) {
  const [run, setRun] = useState<CrewRun | null>(initialRun);
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "triaging" | "plan" | "dispatching" | "board">(
    initialRun ? "board" : "idle"
  );
  const [brainDump, setBrainDump] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Live dispatch overlays, keyed by workstream id.
  const [liveStatus, setLiveStatus] = useState<Record<string, CrewStatus>>({});
  const [steps, setSteps] = useState<Record<string, AgentStep[]>>({});
  const [products, setProducts] = useState<Record<string, { id: string; wp: WorkProduct }>>({});
  const [filedBack, setFiledBack] = useState<Record<string, string>>({});

  // Brief-quality: local echo + running stats.
  const [quality, setQuality] = useState<Record<string, BriefQuality>>(() =>
    Object.fromEntries((initialRun?.workstreams ?? []).filter((w) => w.quality).map((w) => [w.id, w.quality as BriefQuality]))
  );
  const [stats, setStats] = useState<BriefQualityStats>(qualityStats);
  const [, startQuality] = useTransition();

  // Parallel toggle + the gate's block reason (null when allowed).
  const [parallel, setParallel] = useState(parallelEnabled);
  const [parallelBlocked, setParallelBlocked] = useState<string | null>(null);
  const [, startParallel] = useTransition();

  const dispatchAbort = useRef<AbortController | null>(null);

  const effStatus = (w: CrewWorkstream): CrewStatus => liveStatus[w.id] ?? w.status;
  const effQuality = (w: CrewWorkstream): BriefQuality | null => quality[w.id] ?? w.quality;

  /* ---- Triage -------------------------------------------------------- */
  async function delegate() {
    const text = brainDump.trim();
    if (!text || phase === "triaging") return;
    setPhase("triaging");
    setError(null);
    setRun(null);
    setNote(null);
    setLiveStatus({});
    setSteps({});
    setProducts({});
    setFiledBack({});
    try {
      const res = await fetch("/api/crew/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brainDump: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Triage failed (HTTP ${res.status})`);
      setRun(data.run as CrewRun);
      setNote(data.note ?? null);
      setPhase("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  /* ---- Dispatch (SSE) ------------------------------------------------ */
  async function dispatch() {
    if (!run) return;
    setPhase("dispatching");
    setError(null);
    const ac = new AbortController();
    dispatchAbort.current = ac;
    try {
      const res = await fetch("/api/crew/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Dispatch failed (HTTP ${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            handle(JSON.parse(payload) as DispatchEvent);
          } catch {
            /* skip malformed line */
          }
        }
      }
      setPhase("board");
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setPhase("board");
    }
  }

  function handle(evt: DispatchEvent) {
    switch (evt.type) {
      case "workstream":
        setLiveStatus((p) => ({ ...p, [evt.id]: evt.status }));
        break;
      case "step":
        setSteps((p) => {
          const cur = p[evt.workstreamId] ?? [];
          if (cur.some((s) => s.seq === evt.step.seq)) return p;
          return { ...p, [evt.workstreamId]: [...cur, evt.step] };
        });
        break;
      case "work_product":
        setProducts((p) => ({ ...p, [evt.workstreamId]: { id: evt.id, wp: evt.workProduct } }));
        break;
      case "filed_back":
        setFiledBack((p) => ({ ...p, [evt.workstreamId]: evt.sourceDoc }));
        break;
      case "error":
        setError(evt.message);
        break;
    }
  }

  /* ---- Quality + parallel ------------------------------------------- */
  function tapQuality(wsId: string, q: BriefQuality) {
    if (quality[wsId]) return;
    setQuality((p) => ({ ...p, [wsId]: q }));
    setLiveStatus((p) => ({ ...p, [wsId]: "done" }));
    startQuality(async () => {
      try {
        setStats(await recordQualityAction(wsId, q));
      } catch {
        /* keep the optimistic local state; /admin reflects the durable count */
      }
    });
  }

  function toggleParallel(next: boolean) {
    setParallelBlocked(null);
    setParallel(next); // optimistic; the server may refuse to enable below the gate
    startParallel(async () => {
      try {
        const res = await setParallelAction(next);
        setParallel(res.enabled);
        setStats(res.stats);
        setParallelBlocked(res.blocked);
      } catch {
        setParallel(!next);
      }
    });
  }

  function reset() {
    dispatchAbort.current?.abort();
    setRun(null);
    setNote(null);
    setBrainDump("");
    setError(null);
    setLiveStatus({});
    setSteps({});
    setProducts({});
    setFiledBack({});
    setPhase("idle");
  }

  const workstreams = (run?.workstreams ?? []).filter((w) => w.kind === "workstream");
  const inlineItems = (run?.workstreams ?? []).filter((w) => w.kind === "inline");
  const dispatching = phase === "dispatching";

  return (
    <div className="w-full">
      {/* The box */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-400">
          Brain-dump — everything on your plate
        </label>
        <textarea
          value={brainDump}
          onChange={(e) => setBrainDump(e.target.value)}
          placeholder={EXAMPLE}
          rows={3}
          disabled={phase === "triaging" || dispatching}
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base outline-none transition-colors focus:border-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={delegate}
            disabled={!brainDump.trim() || phase === "triaging" || dispatching}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "triaging" ? "Splitting into workstreams…" : "Delegate"}
          </button>
          {phase === "idle" && !brainDump && (
            <button onClick={() => setBrainDump(EXAMPLE)} className="text-xs text-neutral-400 hover:underline">
              Use the example
            </button>
          )}
          {(phase === "plan" || phase === "board") && (
            <button onClick={reset} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              New brain-dump
            </button>
          )}
          <ParallelToggle
            enabled={parallel}
            onChange={toggleParallel}
            stats={stats}
            blocked={parallelBlocked}
            disabled={dispatching}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Triage note */}
      {note && (phase === "plan" || phase === "board" || dispatching) && (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-600 dark:text-neutral-300">Triage:</span> {note}
        </p>
      )}

      {/* Inline answers */}
      {inlineItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Answered inline</div>
          <div className="space-y-2">
            {inlineItems.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50"
              >
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{w.title}</div>
                {w.inlineAnswer && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">
                    {w.inlineAnswer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PLAN — confirm before dispatch */}
      {phase === "plan" && run && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Proposed split</h2>
            <span className="text-sm text-neutral-400">
              {workstreams.length} workstream{workstreams.length === 1 ? "" : "s"} · each brief is shown below
            </span>
          </div>

          <div className="space-y-3">
            {workstreams.map((w) => (
              <PlanCard key={w.id} w={w} allWorkstreams={run.workstreams} />
            ))}
          </div>

          {/* Confirm-before-dispatch action bar */}
          <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
            <button
              onClick={dispatch}
              disabled={workstreams.length === 0}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirm &amp; dispatch {workstreams.length} workstream{workstreams.length === 1 ? "" : "s"} →
            </button>
            <button onClick={reset} className="text-sm font-medium text-neutral-500 hover:underline dark:text-neutral-400">
              Discard
            </button>
            <span className="ml-auto text-xs text-neutral-400">
              {parallel ? `Parallel on · up to ${MAX_PARALLEL} at once` : "Sequential · one agent session at a time"}
            </span>
          </div>
        </div>
      )}

      {/* BOARD — the ledger */}
      {(phase === "board" || dispatching) && run && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Ledger</h2>
            {dispatching ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                dispatching{parallel ? ` · up to ${MAX_PARALLEL} at once` : " · one at a time"}
              </span>
            ) : (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">dispatch complete</span>
            )}
          </div>

          {/* Kanban columns */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {BOARD_COLUMNS.map((col) => {
              const cards = workstreams.filter((w) => effStatus(w) === col.status);
              return (
                <div key={col.status} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-2 dark:border-neutral-800 dark:bg-neutral-900/40">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      {col.label}
                    </span>
                    <span className="rounded-full bg-white px-1.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((w) => (
                      <MiniCard key={w.id} w={w} status={effStatus(w)} quality={effQuality(w)} />
                    ))}
                    {cards.length === 0 && <div className="px-1 py-2 text-[11px] text-neutral-300 dark:text-neutral-600">—</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail: every workstream's live steps, deliverable, and quality tap */}
          <div className="mt-5 space-y-4">
            {workstreams.map((w) => (
              <DetailCard
                key={w.id}
                w={w}
                status={effStatus(w)}
                steps={steps[w.id] ?? []}
                product={products[w.id] ?? null}
                filedBackDoc={filedBack[w.id] ?? null}
                quality={effQuality(w)}
                onTap={(q) => tapQuality(w.id, q)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parallel toggle                                                    */
/* ------------------------------------------------------------------ */

function ParallelToggle({
  enabled,
  onChange,
  stats,
  blocked,
  disabled,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  stats: BriefQualityStats;
  blocked: string | null;
  disabled: boolean;
}) {
  const unlocked = parallelUnlocked(stats);
  // The gate blocks turning it ON below the sustained bar; OFF is always allowed.
  const lockedForOn = !enabled && !unlocked;
  return (
    <div className="ml-auto flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <button
          role="switch"
          aria-checked={enabled}
          disabled={disabled || lockedForOn}
          onClick={() => onChange(!enabled)}
          title={
            unlocked
              ? `Brief quality clears the bar (≥${PARALLEL_QUALITY_BAR}% across ≥${PARALLEL_MIN_RATED})`
              : `Locked — unlocks at ≥${PARALLEL_QUALITY_BAR}% no-correction across ≥${PARALLEL_MIN_RATED} rated briefs`
          }
          className={
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
            (enabled ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700")
          }
        >
          <span className={"inline-block h-4 w-4 transform rounded-full bg-white transition-transform " + (enabled ? "translate-x-4" : "translate-x-0.5")} />
        </button>
        <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          Parallel (max {MAX_PARALLEL})
          {lockedForOn && <span aria-hidden title="Locked until brief quality is proven">🔒</span>}
        </span>
      </div>
      <span className="text-[11px] text-neutral-400">
        {stats.pct == null ? "no briefs rated" : `${stats.pct}% clean · ${stats.rated}/${PARALLEL_MIN_RATED} rated`}
        {unlocked ? " · unlocked" : ""}
      </span>
      {blocked && <span className="max-w-[16rem] text-right text-[11px] text-amber-600 dark:text-amber-400">{blocked}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plan card — the brief, shown before dispatch                        */
/* ------------------------------------------------------------------ */

function DependsOn({ w, all }: { w: CrewWorkstream; all: CrewWorkstream[] }) {
  if (w.dependsOn.length === 0) return null;
  const names = w.dependsOn.map((seq) => all.find((x) => x.seq === seq)?.title ?? `#${seq + 1}`);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
      waits on {names.join(", ")}
    </span>
  );
}

function PlanCard({ w, allWorkstreams }: { w: CrewWorkstream; allWorkstreams: CrewWorkstream[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {w.seq + 1}
        </span>
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{w.title}</span>
        <DependsOn w={w} all={allWorkstreams} />
        <span className="ml-auto text-xs text-neutral-400">{open ? "Hide brief ▲" : "Show brief ▼"}</span>
      </button>
      {open && <div className="px-4 pb-4">{w.brief ? <BriefView brief={w.brief} /> : <p className="text-sm text-neutral-400">No brief.</p>}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board cards                                                         */
/* ------------------------------------------------------------------ */

function MiniCard({ w, status, quality }: { w: CrewWorkstream; status: CrewStatus; quality: BriefQuality | null }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="font-medium text-neutral-800 dark:text-neutral-100">{w.title}</div>
      <div className="mt-1 flex items-center gap-1">
        {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />}
        {quality && (
          <span
            className={
              "rounded px-1 py-px text-[10px] font-semibold " +
              (quality === "no_correction"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300")
            }
          >
            {quality === "no_correction" ? "✓ clean" : "corrected"}
          </span>
        )}
      </div>
    </div>
  );
}

function DetailCard({
  w,
  status,
  steps,
  product,
  filedBackDoc,
  quality,
  onTap,
}: {
  w: CrewWorkstream;
  status: CrewStatus;
  steps: AgentStep[];
  product: { id: string; wp: WorkProduct } | null;
  filedBackDoc: string | null;
  quality: BriefQuality | null;
  onTap: (q: BriefQuality) => void;
}) {
  const [openBrief, setOpenBrief] = useState(false);
  const st = STATUS_STYLE[status];
  // Reconnect a persisted deliverable (after refresh) to the Library.
  const libraryId = product?.id ?? w.workProductId;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {w.seq + 1}
        </span>
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{w.title}</span>
        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + st.cls}>{st.label}</span>
        {w.brief && (
          <button onClick={() => setOpenBrief((o) => !o)} className="text-xs text-neutral-400 hover:underline">
            {openBrief ? "Hide brief" : "Brief"}
          </button>
        )}
        {libraryId && (
          <Link href={`/library/${libraryId}`} className="ml-auto text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            Open in Library →
          </Link>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {openBrief && w.brief && <BriefView brief={w.brief} />}

        {/* Live agent steps */}
        {steps.length > 0 && <StepTimeline steps={steps} running={status === "running"} />}

        {/* Needs input */}
        {status === "needs_input" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            {w.error ? (
              <>The agent stopped before a deliverable: {w.error}</>
            ) : (
              <>The agent finished without a deliverable — this one needs your input. Try re-dispatching or refining the brief.</>
            )}
          </div>
        )}

        {/* Filed back into the graph */}
        {filedBackDoc && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span aria-hidden>↩</span>
            <span>
              Filed back into the graph as a fact · source <span className="font-medium">TrustLayer work product</span> ·{" "}
              <Link href="/facts" className="underline">
                view in Facts
              </Link>
            </span>
          </div>
        )}

        {/* The deliverable */}
        {product && <WorkProductView wp={product.wp} />}

        {/* Brief-quality one-tap */}
        {(status === "review" || status === "done") && (
          <QualityTap quality={quality} onTap={onTap} />
        )}
      </div>
    </div>
  );
}

function QualityTap({ quality, onTap }: { quality: BriefQuality | null; onTap: (q: BriefQuality) => void }) {
  if (quality) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Brief quality:</span>
        <span
          className={
            "rounded px-2 py-0.5 font-semibold " +
            (quality === "no_correction"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300")
          }
        >
          {quality === "no_correction" ? "Needed no correction" : "Needed correction"}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Was the brief right?</span>
      <button
        onClick={() => onTap("no_correction")}
        className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
      >
        Needed no correction
      </button>
      <button
        onClick={() => onTap("correction")}
        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
      >
        Needed correction
      </button>
      <span className="text-[11px] text-neutral-400">one tap · rolls up on /admin</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact live step timeline                                          */
/* ------------------------------------------------------------------ */

const KIND_ICON: Record<AgentStep["kind"], string> = {
  thought: "💭",
  tool_call: "▶",
  tool_result: "✓",
  final: "✔",
  error: "✕",
};

function StepTimeline({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-1.5 dark:border-neutral-900">
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Agent steps</span>
        {running && (
          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" /> working…
          </span>
        )}
      </div>
      <ol className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {steps.map((s) => (
          <li key={s.seq} className={"px-3 py-2 " + (s.kind === "tool_result" ? "pl-7" : "")}>
            <div className="flex items-start gap-2">
              <span
                className={
                  "mt-0.5 text-[11px] " +
                  (s.kind === "error"
                    ? "text-red-500"
                    : s.kind === "tool_result" || s.kind === "final"
                    ? "text-emerald-500"
                    : s.kind === "tool_call"
                    ? "text-blue-500"
                    : "text-neutral-400")
                }
                aria-hidden
              >
                {KIND_ICON[s.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    "text-[13px] " +
                    (s.kind === "thought"
                      ? "italic text-neutral-500 dark:text-neutral-400"
                      : s.kind === "error"
                      ? "text-red-700 dark:text-red-300"
                      : "text-neutral-800 dark:text-neutral-100")
                  }
                >
                  {s.summary}
                </p>
                {s.stdout && s.stdout.trim() && (
                  <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] leading-relaxed text-emerald-200">
                    {s.stdout.trim()}
                  </pre>
                )}
                {s.charts && s.charts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {s.charts.map((ch, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={`data:${ch.mime};base64,${ch.base64}`}
                        alt={`chart ${i + 1}`}
                        className="max-w-full rounded-md border border-neutral-200 bg-white dark:border-neutral-800"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
