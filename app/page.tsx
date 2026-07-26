import Link from "next/link";
import { isDatabaseReachable } from "@/lib/db";
import { loadConnections } from "@/lib/ask/sources";
import { loadSuggestedQuestions } from "@/lib/ask/demo";
import { ALL_TOOLS, SOURCE_SHORT, type SourceTool } from "@/lib/ask/types";
import AskClient from "./AskClient";

// Reachability + connection state are read on every request.
export const dynamic = "force-dynamic";

const TOOL_DOT: Record<SourceTool, string> = {
  crm: "bg-violet-500",
  spreadsheet: "bg-emerald-500",
  email: "bg-blue-500",
  calls: "bg-amber-500",
};

export default async function Home({
  searchParams,
}: {
  searchParams?: { ask?: string };
}) {
  const dbConnected = await isDatabaseReachable();
  const initialQuestion = typeof searchParams?.ask === "string" ? searchParams.ask : undefined;

  // Load connection state (defaults to all connected if the table isn't there).
  let connected = new Set<SourceTool>(ALL_TOOLS);
  if (dbConnected) {
    try {
      const conns = await loadConnections();
      connected = new Set(conns.filter((c) => c.connected).map((c) => c.source_tool));
    } catch {
      /* migration not applied — treat all as connected */
    }
  }
  const suggested = loadSuggestedQuestions();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">TrustLayer</h1>
          {dbConnected ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-500/10 dark:text-green-300">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Database connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Database not connected
            </span>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Ask a question about your accounts. Every answer is built{" "}
          <span className="font-medium text-neutral-600 dark:text-neutral-300">only</span> from your
          connected sources — with citations, freshness, and any conflicts shown in the open.
        </p>

        {/* Source connection pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {ALL_TOOLS.map((t) => {
            const on = connected.has(t);
            return (
              <span
                key={t}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                  (on
                    ? "border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                    : "border-dashed border-neutral-300 text-neutral-400 line-through dark:border-neutral-700")
                }
              >
                <span className={"h-1.5 w-1.5 rounded-full " + (on ? TOOL_DOT[t] : "bg-neutral-300 dark:bg-neutral-600")} />
                {SOURCE_SHORT[t]}
              </span>
            );
          })}
          <Link href="/admin" className="ml-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
            manage sources →
          </Link>
        </div>
      </header>

      {/* The Ask experience */}
      {dbConnected ? (
        <AskClient suggested={suggested} initialQuestion={initialQuestion} />
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The database isn’t reachable, so Ask can’t retrieve evidence. Set <code>DATABASE_URL</code> and run{" "}
          <code>npm run db:migrate</code>, then reload.
        </div>
      )}

      {/* Footer nav */}
      <nav className="mt-10 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        {[
          ["/onboarding", "Setup"],
          ["/sources", "Sources"],
          ["/admin", "Admin"],
          ["/facts", "Facts"],
          ["/conflicts", "Conflicts"],
          ["/decisions", "Decisions"],
          ["/library", "Library"],
          ["/settings", "Settings"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="text-blue-700 hover:underline dark:text-blue-400">
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
