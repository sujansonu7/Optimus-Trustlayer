import Link from "next/link";
import { loadEntityGraph } from "@/lib/entities/groups";
import EntitiesClient from "./EntitiesClient";

// Resolution is recomputed from the ledger on every request — never cached.
export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  let entities: Awaited<ReturnType<typeof loadEntityGraph>>["entities"] = [];
  let ok = true;
  try {
    ({ entities } = await loadEntityGraph());
  } catch {
    ok = false;
  }

  const resolvedCount = entities.filter((e) => e.resolved).length;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
          <Link href="/review" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Review queue →
          </Link>
          <Link href="/facts" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Facts →
          </Link>
          <Link href="/admin" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Admin →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          One card per resolved identity: the canonical name, every spelling each tool
          uses for it, and why each one was folded in. Resolution is recomputed from
          the fact ledger on every load — nothing here is a stored guess. Borderline
          pairs the resolver would not decide on its own wait in the{" "}
          <Link href="/review" className="underline">
            review queue
          </Link>
          .
        </p>
      </header>

      {!ok ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          No facts to resolve yet. Run{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">npm run db:migrate</code>,
          then ingest from{" "}
          <Link href="/admin" className="font-semibold underline">
            /admin
          </Link>
          .
        </div>
      ) : entities.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          No entities yet — ingest the fixture from{" "}
          <Link href="/admin" className="font-semibold underline">
            /admin
          </Link>
          .
        </div>
      ) : (
        <EntitiesClient entities={entities} resolvedCount={resolvedCount} />
      )}
    </main>
  );
}
