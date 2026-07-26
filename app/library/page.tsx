import Link from "next/link";
import { loadWorkProducts } from "@/lib/agent/library";
import type { WorkProductRow } from "@/lib/agent/types";

// The Library: every work product the agent has delivered. These are deliverables,
// not knowledge — they survive session deletion and cite the fact ledger directly.
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  let items: WorkProductRow[] = [];
  let dbError = false;
  try {
    items = await loadWorkProducts();
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            {items.length} work product{items.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Formatted briefs the agent produced from your governed knowledge. Every claim carries its
          citations. Ask a work request on the{" "}
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
            home page
          </Link>{" "}
          to create one.
        </p>
      </header>

      {dbError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The Library isn’t reachable. Set <code>DATABASE_URL</code> and run <code>npm run db:migrate</code>.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
          No work products yet. Try a request like{" "}
          <Link href={`/?ask=${encodeURIComponent("prep me for the Silverline renewal call")}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            “prep me for the Silverline renewal call”
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((w) => (
            <li key={w.id}>
              <Link
                href={`/library/${w.id}`}
                className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{w.title}</span>
                    {w.entity && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {w.entity}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-400">“{w.request}”</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {new Date(w.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-10 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        <Link href="/" className="text-blue-700 hover:underline dark:text-blue-400">
          ← Ask
        </Link>
        <Link href="/admin" className="text-blue-700 hover:underline dark:text-blue-400">
          Admin
        </Link>
      </nav>
    </main>
  );
}
