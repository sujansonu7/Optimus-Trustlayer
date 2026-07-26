import Link from "next/link";
import {
  PARALLEL_MIN_RATED,
  PARALLEL_QUALITY_BAR,
  parallelUnlocked,
  type BriefQualityStats,
} from "@/lib/crew/types";

/**
 * The brief-quality instrumentation for /crew, rolled up. Every produced brief
 * gets a one-tap verdict ("needed no correction" / "needed correction"); this is
 * the running percentage that gates the Parallel toggle — you enable parallel
 * dispatch only once briefs are proven reliable (≥ the quality bar).
 */
export default function CrewQuality({
  stats,
  parallelEnabled,
}: {
  stats: BriefQualityStats;
  parallelEnabled: boolean;
}) {
  const pct = stats.pct;
  const meetsBar = pct != null && pct >= PARALLEL_QUALITY_BAR;
  const unlocked = parallelUnlocked(stats);
  const remaining = Math.max(0, PARALLEL_MIN_RATED - stats.rated);
  const color =
    pct == null
      ? "text-neutral-400"
      : pct >= PARALLEL_QUALITY_BAR
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-amber-600 dark:text-amber-400";

  return (
    <section className="mt-10 border-t border-neutral-100 pt-8 dark:border-neutral-900">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Crew · brief quality</h2>
        <Link href="/crew" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
          Open crew →
        </Link>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        The brief is the product. Each delivered brief gets a one-tap verdict from the owner; this is the running share
        that needed <span className="font-medium text-neutral-700 dark:text-neutral-200">no correction</span>.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        {/* The headline percentage */}
        <div className="flex items-baseline gap-2">
          <span className={"text-4xl font-bold tabular-nums " + color}>{pct == null ? "—" : `${pct}%`}</span>
          <span className="text-sm text-neutral-400">needed no correction</span>
        </div>

        {/* Progress bar toward the parallel bar */}
        <div className="min-w-[12rem] flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className={"h-full rounded-full transition-all " + (meetsBar ? "bg-emerald-500" : "bg-amber-500")}
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400">
            <span>
              {stats.rated} brief{stats.rated === 1 ? "" : "s"} rated · {stats.noCorrection} clean · {stats.correction}{" "}
              corrected
            </span>
            <span>bar: {PARALLEL_QUALITY_BAR}% across ≥{PARALLEL_MIN_RATED}</span>
          </div>
        </div>
      </div>

      {/* Parallel state + the standing rule */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
            (parallelEnabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")
          }
        >
          Parallel {parallelEnabled ? "ON" : "OFF"}
        </span>
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
            (unlocked
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400")
          }
        >
          Gate {unlocked ? "unlocked" : "locked"}
        </span>
        <span className="text-neutral-500 dark:text-neutral-400">
          Parallel dispatch (max 2 concurrent) unlocks only at a sustained ≥ {PARALLEL_QUALITY_BAR}% no-correction across
          ≥ {PARALLEL_MIN_RATED} rated briefs
          {!unlocked &&
            (remaining > 0
              ? ` — ${remaining} more brief${remaining === 1 ? "" : "s"} to rate`
              : meetsBar
              ? ""
              : " — quality below the bar")}
          .
        </span>
        {parallelEnabled && !unlocked && (
          <span className="text-amber-600 dark:text-amber-400">
            ⚠ On but below the gate — turn it off on{" "}
            <Link href="/crew" className="underline">
              /crew
            </Link>
            .
          </span>
        )}
      </div>
    </section>
  );
}
