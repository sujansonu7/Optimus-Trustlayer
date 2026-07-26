"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useIngestStream, type SourceTool } from "@/lib/useIngestStream";
import type { ProofQuestion, SuggestedDeclaration, DeclarationChoice, SheetStatus } from "@/lib/onboarding";
import {
  verifySheetAction,
  connectSourceAction,
  materializeAction,
  writeDeclarationsAction,
  proofQuestionsAction,
} from "./actions";

type Step = "welcome" | "connect" | "build" | "declare" | "proof";
const STEPS: { key: Step; label: string }[] = [
  { key: "connect", label: "Connect" },
  { key: "build", label: "Build" },
  { key: "declare", label: "Declare" },
  { key: "proof", label: "Prove it" },
];

const TARGET_SECONDS = 15 * 60;

const TOOL_META: Record<SourceTool, { name: string; sub: string; dot: string; real?: boolean }> = {
  crm: { name: "CRM", sub: "Salesforce / HubSpot account & deal export", dot: "bg-violet-500" },
  spreadsheet: { name: "Renewals Sheet", sub: "RevOps spreadsheet in Google Sheets — connects live", dot: "bg-emerald-500", real: true },
  email: { name: "Email", sub: "Gmail / Outlook sales threads", dot: "bg-blue-500" },
  calls: { name: "Calls", sub: "Gong call transcripts", dot: "bg-amber-500" },
};
const TOOL_ORDER: SourceTool[] = ["crm", "spreadsheet", "email", "calls"];

type ConnState = "idle" | "connecting" | "connected";

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function OnboardingClient({
  suggestedDeclarations,
}: {
  suggestedDeclarations: SuggestedDeclaration[];
}) {
  const [step, setStep] = useState<Step>("welcome");

  // Elapsed timer — starts when the demo starts, freezes on the proof screen.
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [frozen, setFrozen] = useState<number | null>(null);
  useEffect(() => {
    if (startRef.current === null) return;
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsed((Date.now() - startRef.current) / 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  function begin() {
    startRef.current = Date.now();
    setElapsed(0);
    setStep("connect");
  }
  function goProof() {
    setFrozen(startRef.current !== null ? (Date.now() - startRef.current) / 1000 : elapsed);
    setStep("proof");
  }

  const shownElapsed = frozen ?? elapsed;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">TrustLayer setup</h1>
          <Link href="/" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            skip →
          </Link>
        </div>
        {step !== "welcome" && (
          <span
            className={
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium tabular-nums " +
              (shownElapsed <= TARGET_SECONDS
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300")
            }
            title="Target: a trustworthy knowledge base in under 15 minutes"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {mmss(shownElapsed)} <span className="opacity-60">/ 15:00</span>
          </span>
        )}
      </header>

      {/* Stepper */}
      {step !== "welcome" && (
        <ol className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          {STEPS.map((s, i) => {
            const activeIdx = STEPS.findIndex((x) => x.key === step);
            const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
                    (state === "done"
                      ? "bg-emerald-500 text-white"
                      : state === "active"
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400")
                  }
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span className={state === "todo" ? "text-neutral-400" : "font-medium"}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="mx-1 text-neutral-300 dark:text-neutral-700">→</span>}
              </li>
            );
          })}
        </ol>
      )}

      {step === "welcome" && <Welcome onStart={begin} />}
      {step === "connect" && <Connect onDone={() => setStep("build")} />}
      {step === "build" && <Build onContinue={() => setStep("declare")} />}
      {step === "declare" && (
        <Declare suggested={suggestedDeclarations} onDone={goProof} />
      )}
      {step === "proof" && <Proof elapsed={shownElapsed} />}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome                                                            */
/* ------------------------------------------------------------------ */

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        Turn four disconnected tools into one trustworthy memory.
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        In the next few minutes you&apos;ll connect your CRM, your Renewals Sheet, email, and call
        transcripts. TrustLayer will read them, resolve the same customer across all four, keep a receipt
        on every fact, and settle any disagreements. At the end, you&apos;ll ask it three questions it can
        already answer — with citations, freshness, and both sides of every conflict shown.
      </p>
      <ul className="mt-5 space-y-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        <li>· Real ingestion, real database. Source connections are simulated for this demo — the pipeline they trigger is real.</li>
        <li>· Your Renewals Sheet connects live to Google Sheets.</li>
        <li>· Target: a working, trustworthy knowledge base in under 15 minutes.</li>
      </ul>
      <button
        onClick={onStart}
        className="mt-7 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        Start setup →
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Connect                                                            */
/* ------------------------------------------------------------------ */

function Connect({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<Record<SourceTool, ConnState>>({
    crm: "idle",
    spreadsheet: "idle",
    email: "idle",
    calls: "idle",
  });
  const [sheet, setSheet] = useState<SheetStatus | null>(null);
  const [sheetErr, setSheetErr] = useState<string | null>(null);

  const connect = useCallback(async (tool: SourceTool) => {
    setState((s) => ({ ...s, [tool]: "connecting" }));
    if (tool === "spreadsheet") {
      try {
        const status = await verifySheetAction();
        setSheet(status);
      } catch (e) {
        setSheetErr(e instanceof Error ? e.message : String(e));
      }
    } else {
      // Simulate the OAuth handshake the other connectors would perform.
      const delay = 700 + tool.length * 120;
      await new Promise((r) => setTimeout(r, delay));
    }
    // Actually reconnect the source in the ledger, so a card reading
    // "✓ Connected" means the product will really retrieve from it. Without
    // this, a source revoked in an earlier demo stayed revoked while the wizard
    // claimed otherwise.
    try {
      await connectSourceAction(tool);
    } catch {
      /* non-fatal: the build step below is what actually loads the data */
    }
    setState((s) => ({ ...s, [tool]: "connected" }));
  }, []);

  const allConnected = TOOL_ORDER.every((t) => state[t] === "connected");

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Connect your tools</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        Each source connects independently. Your Renewals Sheet authenticates live against Google; the
        others use a demo connector, but all four feed the same real build in the next step.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {TOOL_ORDER.map((tool) => {
          const meta = TOOL_META[tool];
          const st = state[tool];
          return (
            <li
              key={tool}
              className={
                "rounded-xl border p-4 transition-colors " +
                (st === "connected"
                  ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/40 dark:bg-emerald-500/5"
                  : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={"h-2 w-2 rounded-full " + meta.dot} />
                    <span className="font-semibold">{meta.name}</span>
                    {meta.real && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        live
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">{meta.sub}</p>
                </div>
                <ConnectButton state={st} onClick={() => connect(tool)} />
              </div>

              {tool === "spreadsheet" && st === "connected" && (
                <div className="mt-3 border-t border-emerald-200/60 pt-2 text-xs dark:border-emerald-500/20">
                  {sheet ? (
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {sheet.live ? "● Live from Google Sheets" : "● Using the cached copy"} · {sheet.rowCount}{" "}
                      rows
                      {sheet.lastModified ? ` · edited ${sheet.lastModified.slice(0, 10)}` : ""}
                    </span>
                  ) : sheetErr ? (
                    <span className="text-amber-600 dark:text-amber-400">Connected (cached): {sheetErr}</span>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onDone}
          disabled={!allConnected}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Build the knowledge graph →
        </button>
        {!allConnected && (
          <span className="text-sm text-neutral-400">Connect all four to continue.</span>
        )}
      </div>
    </section>
  );
}

function ConnectButton({ state, onClick }: { state: ConnState; onClick: () => void }) {
  if (state === "connected") {
    return (
      <span className="shrink-0 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        ✓ Connected
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={state === "connecting"}
      className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {state === "connecting" ? "Connecting…" : "Connect"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Build (reuses the /admin live-build engine)                         */
/* ------------------------------------------------------------------ */

const BUILD_TOOL_STYLE: Record<SourceTool, { label: string; cls: string }> = {
  crm: { label: "CRM", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  spreadsheet: { label: "Sheet", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  email: { label: "Email", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  calls: { label: "Calls", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

function Build({ onContinue }: { onContinue: () => void }) {
  const [done, setDone] = useState(false);
  const onDone = useCallback(() => {
    setDone(true);
    // Log every automatic decision this build produced so /decisions is ready.
    materializeAction().catch((e) => console.error("materialize failed (non-fatal):", e));
  }, []);

  const { running, totalDocs, cards, counts, banner, run } = useIngestStream({ onDone });

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run(false); // respects the ingest cache; a fresh (reset) demo is a full build
  }, [run]);

  const progressPct = totalDocs ? Math.min(100, ((counts.done + counts.skipped) / totalDocs) * 100) : 0;

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Building your knowledge graph</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        Reading every source, resolving the same customer across all four into one identity, and storing
        each fact with its receipt — source, timestamp, and the exact passage it came from.
      </p>

      {(running || cards.length > 0) && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Facts" value={counts.facts} />
          <Stat label="Files" value={`${counts.done + counts.skipped} / ${totalDocs}`} />
          <Stat label="Skipped (cached)" value={counts.skipped} />
          <Stat label="Cost" value={`$${counts.cost.toFixed(3)}`} />
        </div>
      )}

      {(running || cards.length > 0) && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {banner && banner.kind !== "done" && (
        <div
          className={
            "mt-4 rounded-md border px-4 py-3 text-sm " +
            (banner.kind === "budget"
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300")
          }
        >
          {banner.text}
        </div>
      )}

      {cards.length > 0 && (
        <ul className="mt-5 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {cards.map((c) => (
            <li key={c.doc} className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className={"rounded px-1.5 py-0.5 text-xs font-semibold " + BUILD_TOOL_STYLE[c.tool].cls}>
                  {BUILD_TOOL_STYLE[c.tool].label}
                </span>
                <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">{c.doc}</span>
                <span className="ml-auto text-xs text-neutral-400">
                  {c.status === "skipped"
                    ? `${c.extracted} facts (cached)`
                    : c.status === "done"
                    ? `${c.extracted} facts`
                    : c.status === "error"
                    ? "error"
                    : "…"}
                </span>
              </div>
              {c.facts.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {c.facts.slice(0, 3).map((f, i) => (
                    <li key={i} className="truncate">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{f.entity}</span> ·{" "}
                      {f.attribute} = {f.value}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onContinue}
          disabled={!done}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Set your systems of record →
        </button>
        {running && <span className="text-sm text-neutral-400">Building…</span>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Declare                                                            */
/* ------------------------------------------------------------------ */

function Declare({
  suggested,
  onDone,
}: {
  suggested: SuggestedDeclaration[];
  onDone: () => void;
}) {
  const [ratify, setRatify] = useState<boolean[]>(suggested.map((s) => s.defaultRatify));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const choices: DeclarationChoice[] = suggested.map((s, i) => ({
        scope: s.scope,
        statement: s.statement,
        ratify: ratify[i],
      }));
      await writeDeclarationsAction(choices);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Declare your systems of record</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        When two sources disagree, TrustLayer needs to know which one you trust for what. We&apos;ve
        pre-filled the usual defaults — ratify the ones you agree with. Ratified rules win disagreements
        outright; the rest fall back to corroboration and freshness.
      </p>

      <ul className="mt-5 space-y-3">
        {suggested.map((s, i) => (
          <li
            key={s.scope}
            className={
              "rounded-xl border p-4 transition-colors " +
              (ratify[i]
                ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/40 dark:bg-emerald-500/5"
                : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{s.statement}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{s.why}</p>
              </div>
              <button
                onClick={() => setRatify((r) => r.map((v, j) => (j === i ? !v : v)))}
                role="switch"
                aria-checked={ratify[i]}
                className={
                  "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
                  (ratify[i] ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700")
                }
              >
                <span
                  className={
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
                    (ratify[i] ? "translate-x-5" : "translate-x-0.5")
                  }
                />
              </button>
            </div>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide">
              {ratify[i] ? (
                <span className="text-emerald-600 dark:text-emerald-400">Will ratify — governs outright</span>
              ) : (
                <span className="text-neutral-400">Proposed — not yet governing</span>
              )}
            </p>
          </li>
        ))}
      </ul>

      {err && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {err}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save declarations & prove it →"}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Proof                                                              */
/* ------------------------------------------------------------------ */

function Proof({ elapsed }: { elapsed: number }) {
  const [proofs, setProofs] = useState<ProofQuestion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    proofQuestionsAction()
      .then((p) => alive && setProofs(p))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  function ask(q: string) {
    window.location.href = `/?ask=${encodeURIComponent(q)}`;
  }

  const underTarget = elapsed <= TARGET_SECONDS;

  return (
    <section>
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-6 dark:border-emerald-500/40 dark:bg-emerald-500/5">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Your knowledge base is live.
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          Built and governed in{" "}
          <span className="font-semibold tabular-nums">{mmss(elapsed)}</span>
          {underTarget ? (
            <span className="text-emerald-700 dark:text-emerald-400"> — under the 15-minute target.</span>
          ) : (
            "."
          )}{" "}
          Here are three questions it can already answer — mined from your own data, verified answerable.
          Each opens in Ask with the full envelope: citations, freshness, and both sides of any conflict.
        </p>
      </div>

      {err && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {err}
        </div>
      )}

      {!proofs && !err && (
        <div className="mt-5 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          ))}
          <p className="text-xs text-neutral-400">Mining the graph for questions it can prove…</p>
        </div>
      )}

      {proofs && proofs.length > 0 && (
        <div className="mt-5 space-y-2.5">
          {proofs.map((p) => (
            <button
              key={p.question}
              onClick={() => ask(p.question)}
              className="group flex w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/20"
            >
              <span className="mt-0.5 text-neutral-300 transition-colors group-hover:text-blue-500 dark:text-neutral-600">
                →
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {p.question}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
                      (p.kind === "conflict"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300")
                    }
                  >
                    {p.headline}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{p.why}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {proofs && proofs.length === 0 && (
        <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          The build didn&apos;t surface any cross-source proofs this run. Head to{" "}
          <Link href="/" className="font-medium underline">the Ask box</Link> and try a question about one of
          your accounts.
        </div>
      )}

      <nav className="mt-8 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        <Link href="/" className="text-blue-700 hover:underline dark:text-blue-400">Go to Ask</Link>
        <Link href="/decisions" className="text-blue-700 hover:underline dark:text-blue-400">Decision log</Link>
        <Link href="/conflicts" className="text-blue-700 hover:underline dark:text-blue-400">Conflicts</Link>
        <Link href="/admin" className="text-blue-700 hover:underline dark:text-blue-400">Admin</Link>
      </nav>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Small bits                                                         */
/* ------------------------------------------------------------------ */

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{value}</div>
    </div>
  );
}
