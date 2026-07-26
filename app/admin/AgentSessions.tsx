"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearAgentSessionsAction } from "./actions";

/**
 * "Clear agent sessions" control — the visible proof of standing rule #5. The
 * agent engine holds NO durable knowledge: sessions and their step logs are
 * disposable. Wiping them all changes nothing about what TrustLayer knows, and
 * leaves the delivered work products in the Library intact.
 */
export default function AgentSessions({ sessionCount }: { sessionCount: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function run() {
    setFlash(null);
    startTransition(async () => {
      try {
        const { sessions, skipped } = await clearAgentSessionsAction();
        const kept =
          skipped > 0
            ? ` Kept ${skipped} still-running session${skipped === 1 ? "" : "s"} so their step logs aren’t cut off mid-run.`
            : "";
        setFlash(
          `Cleared ${sessions} agent session${sessions === 1 ? "" : "s"}. Knowledge and the Library are untouched — nothing about what the product knows changed.${kept}`
        );
        router.refresh();
      } catch (err) {
        setFlash(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section className="mt-10 border-t border-neutral-100 pt-8 dark:border-neutral-900">
      <h2 className="text-lg font-semibold tracking-tight">Agent sessions</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        The agent engine keeps no durable knowledge. Each run is a disposable log of the steps it took.
        {sessionCount != null && (
          <>
            {" "}
            There {sessionCount === 1 ? "is" : "are"} currently{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">{sessionCount}</span> session
            {sessionCount === 1 ? "" : "s"}.
          </>
        )}{" "}
        Deleting them all changes nothing about your facts, conflicts, canon, or the briefs saved to your{" "}
        <a href="/library" className="font-medium text-blue-600 underline dark:text-blue-400">
          Library
        </a>
        .
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={pending || sessionCount === 0}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          {pending ? "Clearing…" : "Clear all agent sessions"}
        </button>
      </div>

      {flash && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
          {flash}
        </div>
      )}
    </section>
  );
}
