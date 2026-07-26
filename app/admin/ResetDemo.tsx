"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetDemoAction } from "./actions";

/**
 * The "Reset demo" control. Wipes derived data so /onboarding is repeatable in
 * front of an audience. Destructive, so it requires an explicit confirm click.
 */
export default function ResetDemo() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function run() {
    setFlash(null);
    startTransition(async () => {
      try {
        const { cleared } = await resetDemoAction();
        setConfirming(false);
        setFlash(`Reset complete — cleared ${cleared.join(", ")}. Run the build again on /onboarding.`);
        router.refresh();
      } catch (err) {
        setFlash(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section className="mt-10 rounded-xl border border-red-200 bg-red-50/40 p-5 dark:border-red-500/30 dark:bg-red-500/5">
      <h2 className="text-lg font-semibold tracking-tight text-red-800 dark:text-red-300">Reset demo</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        Wipe all derived data — the fact ledger, ingest cache, belief cache, resolved entities, the
        decision log, <strong>every crew run and its brief-quality ratings</strong>, and{" "}
        <strong>every work product in the Library</strong> — and restore the seed declarations and
        source connections. The fixture files are untouched, so the build reconstructs everything.
        Use this to run{" "}
        <a href="/onboarding" className="font-medium underline">/onboarding</a> again from a clean slate.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
          >
            Reset demo…
          </button>
        ) : (
          <>
            <span className="text-sm font-medium text-red-800 dark:text-red-300">
              This clears all ingested data. Sure?
            </span>
            <button
              onClick={run}
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Resetting…" : "Yes, wipe it"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {flash && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
          {flash}
        </div>
      )}
    </section>
  );
}
