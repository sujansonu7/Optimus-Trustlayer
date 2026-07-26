import Link from "next/link";
import { isDatabaseReachable } from "@/lib/db";
import {
  loadLatestRun,
  loadRun,
  listRunSummaries,
  loadParallelEnabled,
  briefQualityStats,
  type CrewRunSummary,
} from "@/lib/crew/store";
import { loadStepsForSessions } from "@/lib/agent/library";
import type { AgentStep } from "@/lib/agent/types";
import type { BriefQualityStats, CrewRun } from "@/lib/crew/types";
import CrewClient from "./CrewClient";

// Reflect current DB state on every request.
export const dynamic = "force-dynamic";

export default async function CrewPage({
  searchParams,
}: {
  searchParams?: { run?: string };
}) {
  const dbConnected = await isDatabaseReachable();
  const wantedRun = typeof searchParams?.run === "string" ? searchParams.run : null;

  // Load the board + settings, tolerating a database that hasn't been migrated
  // to 0013 yet (the page still renders with an explanatory banner).
  let initialRun: CrewRun | null = null;
  let parallelEnabled = false;
  let stats: BriefQualityStats = { rated: 0, noCorrection: 0, correction: 0, pct: null };
  // Persisted step logs, keyed by WORKSTREAM id, so each card's timeline survives
  // a page reload (the live SSE steps are gone after a refresh).
  const initialSteps: Record<string, AgentStep[]> = {};
  let runs: CrewRunSummary[] = [];
  let migrated = true;
  if (dbConnected) {
    try {
      [initialRun, parallelEnabled, stats, runs] = await Promise.all([
        // ?run=<id> opens an earlier board so its un-rated briefs stay reachable;
        // falling back to the latest run keeps the default behaviour unchanged.
        wantedRun ? loadRun(wantedRun) : loadLatestRun(),
        loadParallelEnabled(),
        briefQualityStats(),
        listRunSummaries(),
      ]);
      if (!initialRun) initialRun = await loadLatestRun();
      const withSession = (initialRun?.workstreams ?? []).filter((w) => w.sessionId);
      if (withSession.length > 0) {
        const bySession = await loadStepsForSessions(withSession.map((w) => w.sessionId as string));
        for (const w of withSession) {
          const steps = bySession[w.sessionId as string];
          if (steps && steps.length > 0) initialSteps[w.id] = steps;
        }
      }
    } catch {
      migrated = false;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Crew</h1>
          <Link href="/" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            ← Ask
          </Link>
          <Link href="/library" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Library →
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Dump everything on your plate in one box. TrustLayer splits it into outcome-shaped workstreams, answers the
          trivial ones inline, and assembles a cited brief for each from your governed knowledge — you confirm before
          anything runs. Confirmed workstreams dispatch to the agent one at a time, moving across the ledger below, and
          every deliverable files back into the graph.
        </p>
      </header>

      {!dbConnected ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The database isn’t reachable, so crew can’t assemble briefs. Set <code>DATABASE_URL</code> and run{" "}
          <code>npm run db:migrate</code>, then reload.
        </div>
      ) : !migrated ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The crew tables aren’t set up yet. Run{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">npm run db:migrate</code> once, then reload
          this page.
        </div>
      ) : (
        <>
          <RunHistory runs={runs} currentId={initialRun?.id ?? null} />
          <CrewClient
            key={initialRun?.id ?? "none"}
            initialRun={initialRun}
            parallelEnabled={parallelEnabled}
            qualityStats={stats}
            initialSteps={initialSteps}
          />
        </>
      )}

      {/* Footer nav */}
      <nav className="mt-10 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        {[
          ["/", "Ask"],
          ["/library", "Library"],
          ["/facts", "Facts"],
          ["/conflicts", "Conflicts"],
          ["/admin", "Admin"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="text-blue-700 hover:underline dark:text-blue-400">
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

/**
 * Earlier brain-dumps, so their un-rated briefs stay reachable. Plain links with
 * ?run=<id> — no client state, and the board re-mounts on the new run's id.
 * The amber count is briefs still awaiting a quality verdict; those are exactly
 * the ratings Gate W-B needs, and they used to be lost the moment you started a
 * new brain-dump.
 */
function RunHistory({ runs, currentId }: { runs: CrewRunSummary[]; currentId: string | null }) {
  if (runs.length <= 1) return null;
  const pendingTotal = runs.reduce((n, r) => n + r.unrated, 0);

  return (
    <div className="mb-5 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Previous brain-dumps
        </span>
        {pendingTotal > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {pendingTotal} brief{pendingTotal === 1 ? "" : "s"} still to rate
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {runs.map((r) => {
          const active = r.id === currentId;
          return (
            <li key={r.id}>
              <Link
                href={`/crew?run=${r.id}`}
                className={
                  "flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors " +
                  (active
                    ? "bg-neutral-100 dark:bg-neutral-900"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60")
                }
              >
                <span className="text-xs tabular-nums text-neutral-400">
                  {r.createdAt.slice(0, 10)}
                </span>
                <span
                  className={
                    "min-w-0 flex-1 truncate " +
                    (active
                      ? "font-medium text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-600 dark:text-neutral-400")
                  }
                >
                  {r.brainDump || "(empty)"}
                </span>
                <span className="text-xs text-neutral-400">
                  {r.total} card{r.total === 1 ? "" : "s"}
                </span>
                {r.unrated > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    {r.unrated} to rate
                  </span>
                )}
                {active && <span className="text-[11px] text-neutral-400">· showing</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
