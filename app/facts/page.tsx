import Link from "next/link";
import { loadFacts, type FactRow } from "@/lib/facts";
import FactsClient from "./FactsClient";

export const dynamic = "force-dynamic";

export default async function FactsPage() {
  let facts: FactRow[] = [];
  let migrated = true;
  try {
    facts = await loadFacts();
  } catch {
    // Migration 0006 not applied (source_quote column missing) or DB down.
    migrated = false;
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Facts</h1>
          <Link href="/admin" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            ← Ingestion
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Every fact TrustLayer currently believes, with its source and the exact
          passage it came from. Search across entities, attributes, and values;
          click any row to see where it came from.
        </p>
      </header>

      {!migrated ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          No facts yet. Run <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">npm run db:migrate</code>,
          then ingest from <Link href="/admin" className="font-semibold underline">/admin</Link>.
        </div>
      ) : facts.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          No facts stored yet. Head to <Link href="/admin" className="font-semibold underline">/admin</Link> and click
          &ldquo;Ingest fixture.&rdquo;
        </div>
      ) : (
        <FactsClient facts={facts} />
      )}
    </main>
  );
}
