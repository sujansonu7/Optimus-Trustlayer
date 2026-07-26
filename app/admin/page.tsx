import Link from "next/link";
import { query } from "@/lib/db";
import AdminClient from "./AdminClient";
import ConflictYield from "./ConflictYield";
import SourceToggles from "./SourceToggles";
import ResetDemo from "./ResetDemo";
import AgentSessions from "./AgentSessions";
import CrewQuality from "./CrewQuality";
import { loadConnections } from "@/lib/ask/sources";
import { cacheStats } from "@/lib/ask/ask";
import { loadParallelEnabled, briefQualityStats } from "@/lib/crew/store";
import type { BriefQualityStats } from "@/lib/crew/types";
import { ALL_TOOLS, type SourceTool } from "@/lib/ask/types";

// Always reflect current DB state.
export const dynamic = "force-dynamic";

async function loadConnState(): Promise<{ source_tool: SourceTool; connected: boolean }[]> {
  try {
    return (await loadConnections()).map((c) => ({ source_tool: c.source_tool, connected: c.connected }));
  } catch {
    // source_connections (migration 0008) not applied yet — show all connected.
    return ALL_TOOLS.map((t) => ({ source_tool: t, connected: true }));
  }
}

async function loadSummary(): Promise<{
  factCount: number | null;
  fileCount: number | null;
  migrated: boolean;
}> {
  try {
    const facts = await query<{ n: string }>(
      `select count(*)::text as n from facts where superseded_at is null`
    );
    const files = await query<{ n: string }>(
      `select count(*)::text as n from ingested_sources`
    );
    return {
      factCount: Number(facts.rows[0].n),
      fileCount: Number(files.rows[0].n),
      migrated: true,
    };
  } catch {
    // ingested_sources (migration 0006) not applied yet, or DB unreachable.
    return { factCount: null, fileCount: null, migrated: false };
  }
}

async function loadSessionCount(): Promise<number | null> {
  try {
    const { rows } = await query<{ n: string }>(`select count(*)::text as n from agent_sessions`);
    return Number(rows[0].n);
  } catch {
    // agent_sessions (migration 0012) not applied yet.
    return null;
  }
}

async function loadCrew(): Promise<{ stats: BriefQualityStats; parallel: boolean } | null> {
  try {
    const [stats, parallel] = await Promise.all([briefQualityStats(), loadParallelEnabled()]);
    return { stats, parallel };
  } catch {
    // crew tables (migration 0013) not applied yet.
    return null;
  }
}

export default async function AdminPage() {
  const summary = await loadSummary();
  const conns = await loadConnState();
  const cache = await cacheStats();
  const sessionCount = await loadSessionCount();
  const crew = await loadCrew();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Admin · Ingestion</h1>
          <Link
            href="/facts"
            className="text-sm text-blue-700 hover:underline dark:text-blue-400"
          >
            View facts →
          </Link>
          <Link
            href="/conflicts"
            className="text-sm text-blue-700 hover:underline dark:text-blue-400"
          >
            View conflicts →
          </Link>
          <Link
            href="/decisions"
            className="text-sm text-blue-700 hover:underline dark:text-blue-400"
          >
            Decision log →
          </Link>
          <Link
            href="/crew"
            className="text-sm text-blue-700 hover:underline dark:text-blue-400"
          >
            Crew →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Read every source, map spreadsheet rows to facts directly, and use the
          Anthropic API to pull facts from emails and call transcripts. Every fact
          is stored with its source, timestamps, and the exact passage it came
          from. Unchanged files are skipped on re-runs.
        </p>
      </header>

      {!summary.migrated && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The ingestion tables aren&apos;t set up yet. Run{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">
            npm run db:migrate
          </code>{" "}
          once, then reload this page.
        </div>
      )}

      <AdminClient
        initialFactCount={summary.factCount}
        initialFileCount={summary.fileCount}
      />

      {summary.migrated && (
        <div className="mt-8">
          <ConflictYield />
        </div>
      )}

      {/* Per-source connection toggles (governance / Beat 6). */}
      <section className="mt-10 border-t border-neutral-100 pt-8 dark:border-neutral-900">
        <SourceToggles initial={conns} />
        {cache && (
          <p className="mt-4 text-xs text-neutral-400">
            Belief cache: <span className="font-medium text-neutral-500 dark:text-neutral-300">{cache.live}</span> live
            answer{cache.live === 1 ? "" : "s"} cached
            {cache.invalidated > 0 && (
              <>
                {" "}· <span className="font-medium text-neutral-500 dark:text-neutral-300">{cache.invalidated}</span>{" "}
                invalidated (kept for history, never served)
              </>
            )}
            . Each answer is keyed by the hash of its evidence set, so a re-ask after any change recomputes.
          </p>
        )}
      </section>

      {/* Crew brief-quality instrumentation + the Parallel gate. */}
      {crew && <CrewQuality stats={crew.stats} parallelEnabled={crew.parallel} />}

      {/* Disposable agent run state (standing rule #5). */}
      <AgentSessions sessionCount={sessionCount} />

      {/* Reset the demo so onboarding is repeatable. */}
      <ResetDemo />
    </main>
  );
}
