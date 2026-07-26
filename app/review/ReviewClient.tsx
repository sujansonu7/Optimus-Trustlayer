"use client";

// Borderline pairs, side by side, with Approve-merge / Keep-separate.
// Decisions persist in resolution_reviews and are honoured by every retrieval
// path from the next question onward.
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ReviewCandidate, DecidedPair, ReviewVerdict } from "@/lib/entities/review";
import type { SourceTool } from "@/lib/ask/types";
import { decidePairAction, undoPairAction } from "./actions";

const TOOL_LABEL: Record<SourceTool, string> = {
  crm: "CRM",
  spreadsheet: "Renewals Sheet",
  email: "Email",
  calls: "Calls",
};

export default function ReviewClient({
  candidates,
  decided,
}: {
  candidates: ReviewCandidate[];
  decided: DecidedPair[];
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const decide = (c: ReviewCandidate, verdict: ReviewVerdict) => {
    setBusy(c.aliasKey);
    startTransition(async () => {
      await decidePairAction(c.aliasKey, c.canonicalKey, verdict);
      setBusy(null);
    });
  };

  const undo = (d: DecidedPair) => {
    setBusy(d.aliasKey);
    startTransition(async () => {
      await undoPairAction(d.aliasKey, d.canonicalKey);
      setBusy(null);
    });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {candidates.length} awaiting your call
        </span>
        {decided.length > 0 && (
          <span className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {decided.length} decided
          </span>
        )}
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          Nothing left to review — every borderline pair has a verdict. New ones
          appear here after the next ingest.
        </div>
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => (
            <li
              key={`${c.aliasKey}::${c.canonicalKey}`}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              {/* The two sides, side by side */}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <Side
                  title={c.aliasRaw}
                  sub={`${c.aliasFactCount} fact${c.aliasFactCount === 1 ? "" : "s"}`}
                  tools={c.aliasTools}
                />
                <div className="flex items-center justify-center">
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    same company?
                  </span>
                </div>
                <Side title={c.canonicalLabel} sub="known account" tools={[]} anchor />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                <span className="font-medium text-neutral-600 dark:text-neutral-300">Why it’s a candidate:</span>{" "}
                {c.why}.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  disabled={pending && busy === c.aliasKey}
                  onClick={() => decide(c, "merge")}
                  className="rounded-full border border-emerald-400 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500/50 dark:bg-transparent dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                >
                  Approve merge
                </button>
                <button
                  disabled={pending && busy === c.aliasKey}
                  onClick={() => decide(c, "separate")}
                  className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-900"
                >
                  Keep separate
                </button>
                <span className="text-[11px] text-neutral-400">
                  applies from your next question onward
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Decided
          </h2>
          <ul className="mt-2 space-y-1.5">
            {decided.map((d) => (
              <li
                key={`${d.aliasKey}::${d.canonicalKey}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900/40"
              >
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  {d.aliasKey}
                </span>
                <span className="text-neutral-400">
                  {d.verdict === "merge" ? "→ merged into" : "≠ kept apart from"}
                </span>
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  {d.canonicalKey}
                </span>
                <span className="text-xs text-neutral-400">{d.decidedAt.slice(0, 10)}</span>
                <button
                  disabled={pending && busy === d.aliasKey}
                  onClick={() => undo(d)}
                  className="ml-auto text-xs text-blue-700 hover:underline disabled:opacity-60 dark:text-blue-400"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-400">
            Approved merges show up as one identity on{" "}
            <Link href="/entities" className="underline">
              /entities
            </Link>{" "}
            and apply to every answer from here on. They deliberately do{" "}
            <span className="italic">not</span> move the{" "}
            <Link href="/admin" className="underline">
              Gate 1 scoreboard
            </Link>
            , which grades the resolver&apos;s own automatic decisions — your calls
            shouldn&apos;t flatter its score.
          </p>
        </section>
      )}
    </div>
  );
}

function Side({
  title,
  sub,
  tools,
  anchor,
}: {
  title: string;
  sub: string;
  tools: SourceTool[];
  anchor?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border px-3 py-2.5 " +
        (anchor
          ? "border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950")
      }
    >
      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">“{title}”</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-neutral-400">{sub}</span>
        {tools.map((t) => (
          <span
            key={t}
            className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >
            {TOOL_LABEL[t]}
          </span>
        ))}
      </div>
    </div>
  );
}
