// Server component: the conflict-yield counter.
//
// Runs the detector and grades it against the planted-conflict oracle
// (lib/conflicts/expected.ts — a checked-in transcription of the value-conflict
// subset of fixture/planted_conflicts.md; the app never opens that answer key).
// Green means: every planted value-conflict caught, and zero junk raised.
import Link from "next/link";
import { detectConflicts } from "@/lib/conflicts/detect";

export default async function ConflictYield() {
  let report;
  try {
    report = await detectConflicts();
  } catch {
    return null; // no facts yet / DB down — the page already surfaces that.
  }

  const y = report.yield;
  const clean = y.caught === y.expected && y.junk === 0;

  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Conflict yield</h2>
        {clean ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
            ✓ all planted caught · zero junk
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            needs attention
          </span>
        )}
        <Link href="/conflicts" className="ml-auto text-sm text-blue-700 hover:underline dark:text-blue-400">
          View conflicts →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Planted caught" value={`${y.caught} / ${y.expected}`} good={y.caught === y.expected} />
        <Stat label="Junk (false positives)" value={String(y.junk)} good={y.junk === 0} />
        <Stat label="Winners correct" value={`${y.winnersCorrect} / ${y.expected}`} good={y.winnersCorrect === y.expected} />
        <Stat label="Total detected" value={String(y.total)} />
      </div>

      {y.missed.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <p className="font-medium">Missed planted conflicts:</p>
          <ul className="mt-1 list-inside list-disc">
            {y.missed.map((m) => (
              <li key={m.planted}>
                {m.entityLabel} · {m.attribute} <span className="text-red-500">({m.planted})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Graded against the value-conflict subset of the planted-conflict answer key
        (sections #3, #5a, #5b, #5c). The other planted items — Silverline&apos;s four
        names, the near-miss pairs, Prairie Point&apos;s buried discount, and the
        product-naming drift — belong to entity resolution and exception detection,
        not cross-source value conflicts, so they are graded elsewhere. The
        false-positive bait (Ironwood / Cedar Vale / Kingfisher) must raise no
        conflict; that is what &ldquo;zero junk&rdquo; verifies.
      </p>
    </section>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div
        className={
          "text-xl font-semibold tabular-nums " +
          (good === undefined
            ? ""
            : good
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400")
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}
