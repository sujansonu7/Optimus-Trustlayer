// Server component: the Gate-1 entity-resolution scoreboard.
//
// Milestone 5's stop-test, rendered. Auto-merge precision is shown huge — green
// at >= 0.98, red below — with the specific pairs it got wrong listed underneath.
// Recall is shown too, deliberately de-emphasised: the gate is set on precision,
// because a wrong merge corrupts downstream answers while a missed merge only
// leaves knowledge unlinked.
import { gradeGate1, GATE1_PRECISION_BAR, type PairVerdict } from "@/lib/entities/gate1";

export default async function Gate1Scoreboard() {
  let report;
  try {
    report = await gradeGate1();
  } catch {
    return null; // no facts yet / DB down — the page already surfaces that.
  }
  if (!report) return null;

  const { precision, recall, nearMiss } = report;
  const merges = report.truePositives + report.falsePositives;
  const pct = precision === null ? "—" : `${(precision * 100).toFixed(1)}%`;
  const good = report.passes;

  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Entity resolution · Gate 1
        </h2>
        {good ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
            ✓ gate passed · no over-merges
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-300">
            gate failed
          </span>
        )}
        <a href="/review" className="ml-auto text-sm text-blue-700 hover:underline dark:text-blue-400">
          Review queue →
        </a>
        <span className="text-xs text-neutral-400">{report.evaluated} labeled pairs graded</span>
      </div>

      {/* The number the gate is set on. */}
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div
            className={
              "text-5xl font-semibold tabular-nums tracking-tight " +
              (good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
            }
          >
            {pct}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Auto-merge precision
          </div>
        </div>
        <div className="pb-1 text-sm text-neutral-500 dark:text-neutral-400">
          bar: {(GATE1_PRECISION_BAR * 100).toFixed(0)}%
          <span className="mx-2 text-neutral-300 dark:text-neutral-700">·</span>
          {merges} merge{merges === 1 ? "" : "s"} made,{" "}
          <span className={report.falsePositives === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {report.falsePositives} wrong
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Correct merges" value={String(report.truePositives)} />
        <Stat
          label="Over-merges"
          value={String(report.falsePositives)}
          good={report.falsePositives === 0}
        />
        <Stat
          label="Near-miss pairs kept apart"
          value={`${nearMiss.keptSeparate} / ${nearMiss.total}`}
          good={nearMiss.total > 0 && nearMiss.keptSeparate === nearMiss.total}
        />
        <Stat
          label="Recall (not gated)"
          value={recall === null ? "—" : `${(recall * 100).toFixed(0)}%`}
        />
      </div>

      {/* The pairs it got wrong — what the guide asks to display. */}
      {report.overMerges.length > 0 && (
        <PairList
          title="Wrongly merged — these are two different entities:"
          pairs={report.overMerges}
        />
      )}

      {nearMiss.collapsed.length > 0 && (
        <PairList
          title="Near-miss pairs the resolver collapsed:"
          pairs={nearMiss.collapsed}
        />
      )}

      {report.missedMerges.length > 0 && (
        <details className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <summary className="cursor-pointer text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {report.missedMerges.length} pair
            {report.missedMerges.length === 1 ? "" : "s"} it should have merged and
            didn&apos;t — recall, not precision
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
            {report.missedMerges.map((p, i) => (
              <li key={i} className="leading-snug">
                <span className="font-medium">{p.a}</span>
                <span className="mx-1.5 text-neutral-400">↮</span>
                <span className="font-medium">{p.b}</span>
                {p.difficulty && (
                  <span className="ml-2 text-xs text-neutral-400">({p.difficulty})</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Graded against{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
          fixture/labeled_pairs.csv
        </code>{" "}
        — the held-out answer key, read here and nowhere else in the product, only
        to score resolution after the fact. The resolver is anchored and
        deliberately conservative: the structured sources define the canonical
        accounts, and a short name folds in only when it is an unambiguous prefix
        of exactly one of them. Two canonical names can never merge with each
        other, which is why the near-miss pairs stay apart. That conservatism is
        also why recall trails precision — short codes and email domains
        (&ldquo;SLG&rdquo;, &ldquo;silverlinelogistics.io&rdquo;) are not prefixes
        of anything and are left unlinked rather than guessed. Human overrides
        from the decision log are not applied here; this scores the automatic
        decision.
      </p>
    </section>
  );
}

function PairList({ title, pairs }: { title: string; pairs: PairVerdict[] }) {
  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <p className="font-medium">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {pairs.map((p, i) => (
          <li key={i} className="leading-snug">
            <span className="font-medium">{p.a}</span>
            <span className="mx-1.5 text-red-400">=</span>
            <span className="font-medium">{p.b}</span>
            {p.mergedKey && (
              <span className="ml-2 text-xs text-red-500 dark:text-red-400">
                → merged as &ldquo;{p.mergedKey}&rdquo;
              </span>
            )}
            {p.note && (
              <div className="text-xs text-red-600/80 dark:text-red-400/80">{p.note}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
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
