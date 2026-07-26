"use client";

// The live agent run. Opens the /api/agent event stream and renders every step
// as it arrives — thought, tool call (with inputs), tool result summary — so the
// work is watchable in real time. When the agent drafts, the finished brief is
// rendered inline and is already saved to /library.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentStep, WorkProduct } from "@/lib/agent/types";
import WorkProductView from "./WorkProductView";

type RunEvent =
  | { type: "session"; sessionId: string }
  | { type: "step"; step: AgentStep }
  | { type: "work_product"; id: string; workProduct: WorkProduct }
  | { type: "done"; workProductId: string | null; sessionId: string }
  | { type: "error"; message: string };

const KIND_ICON: Record<AgentStep["kind"], string> = {
  thought: "💭",
  tool_call: "▶",
  tool_result: "✓",
  final: "✔",
  error: "✕",
};

export default function WorkRunClient({
  question,
  onReset,
  onSimple,
}: {
  question: string;
  onReset: () => void;
  onSimple: () => void;
}) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [product, setProduct] = useState<{ id: string; wp: WorkProduct } | null>(null);
  const [status, setStatus] = useState<"connecting" | "working" | "done" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Correct effect pattern for a side-effecting fetch: start it, and abort it
    // in cleanup. Under React StrictMode (dev) the effect runs twice — the first
    // run is aborted by its cleanup and the second completes. The server honors
    // the abort (route passes the signal into runAgent), so an aborted run does
    // no durable work. In production the effect runs once.
    const ac = new AbortController();
    setSteps([]);
    setProduct(null);
    setError(null);
    setStatus("connecting");

    (async () => {
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || `Agent failed (HTTP ${res.status})`);
        }
        setStatus("working");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt: RunEvent;
            try {
              evt = JSON.parse(payload) as RunEvent;
            } catch {
              continue;
            }
            handle(evt);
          }
        }
        // Stream ended without an explicit done/error → treat as done.
        setStatus((s) => (s === "error" ? s : "done"));
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();

    function handle(evt: RunEvent) {
      switch (evt.type) {
        case "step":
          // A seq can arrive more than once: a long-running tool streams partial
          // output into its result row before the finished step replaces it. So
          // a repeat is an UPDATE, not a duplicate to drop.
          setSteps((prev) => {
            const i = prev.findIndex((s) => s.seq === evt.step.seq);
            if (i === -1) return [...prev, evt.step];
            const next = prev.slice();
            next[i] = evt.step;
            return next;
          });
          break;
        case "work_product":
          setProduct({ id: evt.id, wp: evt.workProduct });
          break;
        case "done":
          setStatus("done");
          break;
        case "error":
          setError(evt.message);
          setStatus("error");
          break;
      }
    }

    return () => ac.abort();
  }, [question]);

  const running = status === "connecting" || status === "working";

  return (
    <div className="mt-6 space-y-4">
      {/* Run header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          Work request
        </span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">“{question}”</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <button onClick={onSimple} className="text-neutral-500 hover:underline dark:text-neutral-400">
            Just answer simply
          </button>
          <button onClick={onReset} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            New request
          </button>
        </div>
      </div>

      {/* Live step timeline */}
      <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-900">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Agent steps</span>
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              {status === "connecting" ? "starting…" : "working…"}
            </span>
          ) : status === "error" ? (
            <span className="text-xs text-red-600 dark:text-red-400">stopped</span>
          ) : (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">done · {steps.length} steps</span>
          )}
        </div>

        <ol className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {steps.map((s) => (
            <StepRow key={s.seq} step={s} />
          ))}
          {steps.length === 0 && running && (
            <li className="px-4 py-3 text-sm text-neutral-400">Contacting the knowledge graph…</li>
          )}
        </ol>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* The finished brief, saved to the Library */}
      {product && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span aria-hidden>✓</span>
            <span>Saved to your Library.</span>
            <Link href={`/library/${product.id}`} className="ml-auto font-medium underline">
              Open in Library →
            </Link>
          </div>
          <WorkProductView wp={product.wp} />
        </div>
      )}

      {/* Finished but nothing drafted */}
      {!product && status === "done" && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          The agent finished without producing a brief. Try rephrasing the request, or ask it as a simple question.
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const isCall = step.kind === "tool_call";
  const isThought = step.kind === "thought";
  const isError = step.kind === "error";
  const input = isCall && step.input ? formatInput(step.input) : null;

  return (
    <li className={"px-4 py-2.5 " + (step.kind === "tool_result" ? "pl-9" : "")}>
      <div className="flex items-start gap-2">
        <span
          className={
            "mt-0.5 select-none text-xs " +
            (isError
              ? "text-red-500"
              : step.kind === "tool_result" || step.kind === "final"
              ? "text-emerald-500"
              : isCall
              ? "text-blue-500"
              : "text-neutral-400")
          }
          aria-hidden
        >
          {KIND_ICON[step.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={
              "text-sm " +
              (isThought
                ? "italic text-neutral-500 dark:text-neutral-400"
                : isError
                ? "text-red-700 dark:text-red-300"
                : "text-neutral-800 dark:text-neutral-100")
            }
          >
            {step.summary}
          </p>
          {input && (
            <pre className="mt-1 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-mono text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              {input}
            </pre>
          )}

          {/* execute_python streams its output + charts straight into the timeline */}
          {step.stdout && step.stdout.trim() && (
            <pre className="mt-1.5 max-h-48 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-emerald-200">
              {step.stdout.trim()}
            </pre>
          )}
          {step.charts && step.charts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {step.charts.map((ch, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={`data:${ch.mime};base64,${ch.base64}`}
                  alt={`chart ${i + 1}`}
                  className="max-w-full rounded-md border border-neutral-200 bg-white dark:border-neutral-800"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function formatInput(input: unknown): string {
  try {
    const obj = input as Record<string, unknown>;
    // execute_python: show the actual Python, not JSON-escaped source.
    if (obj && typeof obj.code === "string") {
      const label = typeof obj.label === "string" && obj.label ? `# ${obj.label}\n` : "";
      return label + obj.code;
    }
    // Compact one-key inputs; pretty-print the draft.
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(input);
  }
}
