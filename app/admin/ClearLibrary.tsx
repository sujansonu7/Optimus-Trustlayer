"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearLibraryAction } from "./actions";

/**
 * "Clear library" control. Empties the Library of delivered work products (the
 * saved briefs) — useful for tidying leftover briefs from prior test/demo runs.
 * Knowledge is untouched: facts, declarations, conflicts, and anything a brief
 * filed back into the graph all survive.
 */
export default function ClearLibrary({ count }: { count: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function run() {
    setFlash(null);
    startTransition(async () => {
      try {
        const { products } = await clearLibraryAction();
        setFlash(
          `Cleared ${products} work product${products === 1 ? "" : "s"} from the Library. Your facts, conflicts, and canon are untouched.`
        );
        router.refresh();
      } catch (err) {
        setFlash(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section className="mt-10 border-t border-neutral-100 pt-8 dark:border-neutral-900">
      <h2 className="text-lg font-semibold tracking-tight">Library</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        The{" "}
        <a href="/library" className="font-medium text-blue-600 underline dark:text-blue-400">
          Library
        </a>{" "}
        holds the briefs the agent has delivered.
        {count != null && (
          <>
            {" "}
            There {count === 1 ? "is" : "are"} currently{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">{count}</span> work product
            {count === 1 ? "" : "s"}.
          </>
        )}{" "}
        Clearing it removes the saved briefs only — the facts they cite, and anything filed back into the graph, remain.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={pending || count === 0}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          {pending ? "Clearing…" : "Clear library"}
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
