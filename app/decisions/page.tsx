import Link from "next/link";
import { query } from "@/lib/db";
import { loadDecisions, materializeDecisions, type DecisionView } from "@/lib/decisions";
import DecisionsClient from "./DecisionsClient";

// Always reflect current DB state.
export const dynamic = "force-dynamic";

async function factCount(): Promise<number | null> {
  try {
    const { rows } = await query<{ n: string }>(
      `select count(*)::text as n from facts where superseded_at is null`
    );
    return Number(rows[0].n);
  } catch {
    return null;
  }
}

export default async function DecisionsPage() {
  const facts = await factCount();

  // First visit after a build: if the ledger has facts but the log is empty,
  // materialize it once so the page is populated without a manual click.
  let decisions: DecisionView[] = [];
  let migrated = true;
  try {
    decisions = await loadDecisions();
    if (decisions.length === 0 && (facts ?? 0) > 0) {
      await materializeDecisions();
      decisions = await loadDecisions();
    }
  } catch {
    migrated = false;
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Decision log</h1>
          <Link href="/" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            ← Home
          </Link>
          <Link href="/conflicts" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Conflicts →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Every automatic decision TrustLayer made while building the graph — which names it{" "}
          <span className="font-medium text-neutral-600 dark:text-neutral-300">merged</span> into one
          identity, how it <span className="font-medium text-neutral-600 dark:text-neutral-300">classified</span>{" "}
          each unstructured line, and how it{" "}
          <span className="font-medium text-neutral-600 dark:text-neutral-300">arbitrated</span> every source
          disagreement — each with its reason and a working revert. Reverting a merge splits the identity
          back apart and recomputes any answer that relied on it.
        </p>
      </header>

      {!migrated ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The decision log tables aren&apos;t set up yet. Run{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">npm run db:migrate</code>, then
          reload.
        </div>
      ) : (facts ?? 0) === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          No facts in the ledger yet, so there are no decisions to show. Run the build on{" "}
          <Link href="/onboarding" className="font-medium underline">
            /onboarding
          </Link>{" "}
          or <Link href="/admin" className="font-medium underline">/admin</Link> first.
        </div>
      ) : (
        <DecisionsClient initial={decisions} />
      )}
    </main>
  );
}
