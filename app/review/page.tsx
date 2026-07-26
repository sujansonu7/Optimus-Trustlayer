import Link from "next/link";
import { loadReviewQueue, type ReviewQueue } from "@/lib/entities/review";
import ReviewClient from "./ReviewClient";

// The queue is derived from the ledger on every load.
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  let queue: ReviewQueue = { candidates: [], decided: [] };
  let ok = true;
  try {
    queue = await loadReviewQueue();
  } catch {
    ok = false;
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
          <Link href="/entities" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Entities →
          </Link>
          <Link href="/admin" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Gate 1 scoreboard →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          The pairs the resolver would not decide on its own. It merges a name only
          when it is an unambiguous prefix of exactly one account — which is why it
          has never made a wrong merge, and why real aliases like an initialism or an
          email domain are left here for you. Your call is remembered and applied
          everywhere from the next question onward.
        </p>
      </header>

      {!ok ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The review table isn’t set up yet. Run{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">npm run db:migrate</code>{" "}
          once, then reload.
        </div>
      ) : (
        <ReviewClient candidates={queue.candidates} decided={queue.decided} />
      )}
    </main>
  );
}
