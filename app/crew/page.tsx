import Link from "next/link";
import { isDatabaseReachable } from "@/lib/db";
import { loadLatestRun, loadParallelEnabled, briefQualityStats } from "@/lib/crew/store";
import { loadStepsForSessions } from "@/lib/agent/library";
import type { AgentStep } from "@/lib/agent/types";
import type { BriefQualityStats, CrewRun } from "@/lib/crew/types";
import CrewClient from "./CrewClient";

// Reflect current DB state on every request.
export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const dbConnected = await isDatabaseReachable();

  // Load the board + settings, tolerating a database that hasn't been migrated
  // to 0013 yet (the page still renders with an explanatory banner).
  let initialRun: CrewRun | null = null;
  let parallelEnabled = false;
  let stats: BriefQualityStats = { rated: 0, noCorrection: 0, correction: 0, pct: null };
  // Persisted step logs, keyed by WORKSTREAM id, so each card's timeline survives
  // a page reload (the live SSE steps are gone after a refresh).
  let initialSteps: Record<string, AgentStep[]> = {};
  let migrated = true;
  if (dbConnected) {
    try {
      [initialRun, parallelEnabled, stats] = await Promise.all([
        loadLatestRun(),
        loadParallelEnabled(),
        briefQualityStats(),
      ]);
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
        <CrewClient
          initialRun={initialRun}
          parallelEnabled={parallelEnabled}
          qualityStats={stats}
          initialSteps={initialSteps}
        />
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
