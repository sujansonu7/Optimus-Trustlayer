// Server-only: dispatch — run confirmed workstreams through the visible agent.
//
// This is the ONLY place crew work actually runs, and only after the owner
// confirmed the plan. It reuses the existing agent loop (lib/agent/loop.ts)
// unchanged: each workstream's brief is composed into the agent's request, the
// agent does its own grounded query_graph / compute / draft, and the resulting
// work product (a) lands in the Library and (b) files back into the graph.
//
// Ordering honors dependencies (a QBR agenda waits on the renewal prep it
// summarizes) and the Parallel setting: OFF → one agent session at a time; ON →
// at most MAX_PARALLEL concurrent. Every transition updates the ledger row AND
// streams a crew event so the board moves live.
import { runAgent } from "@/lib/agent/loop";
import type { AgentStep, WorkProduct } from "@/lib/agent/types";
import { fileWorkProductBack } from "./fileback";
import { loadRun, setRunStatus, updateWorkstream } from "./store";
import { MAX_PARALLEL, type CrewStatus, type CrewWorkstream } from "./types";

export type CrewDispatchEvent =
  | { type: "run_status"; status: "triaged" | "dispatching" | "done" }
  | {
      type: "workstream";
      id: string;
      seq: number;
      status: CrewStatus;
      sessionId?: string | null;
      workProductId?: string | null;
      error?: string | null;
    }
  | { type: "step"; workstreamId: string; step: AgentStep }
  | { type: "work_product"; workstreamId: string; id: string; workProduct: WorkProduct }
  | { type: "filed_back"; workstreamId: string; sourceDoc: string }
  | { type: "done" }
  | { type: "error"; message: string };

type Emit = (e: CrewDispatchEvent) => void | Promise<void>;

/**
 * Compose the agent's request from an assembled brief. The agent re-verifies
 * everything against the graph and cites it; the brief's context is guidance and
 * a head start, never a substitute for the agent's own grounding.
 */
function composePrompt(w: CrewWorkstream): string {
  const lines: string[] = [];
  lines.push(`Deliverable: ${w.title}`);
  lines.push(`Goal: ${w.goal}`);

  if (w.constraints.length > 0) {
    lines.push("", "Constraints:");
    for (const c of w.constraints) lines.push(`- ${c}`);
  }
  if (w.doneCriteria.length > 0) {
    lines.push("", "Done when:");
    for (const d of w.doneCriteria) lines.push(`- ${d}`);
  }

  const ctx = w.brief?.context ?? [];
  if (ctx.length > 0) {
    lines.push(
      "",
      "Relevant context already pulled from the governed knowledge graph (the arbitrated winner is shown where sources disagreed — verify it and cite the same facts):"
    );
    for (const c of ctx) lines.push(`- ${c.text}`);
  }
  if (w.brief?.note) lines.push("", `Note: ${w.brief.note}`);

  lines.push(
    "",
    "Produce the deliverable that satisfies the goal and done-criteria. Use only facts from the connected graph, cite every claim, and flag anything you cannot ground."
  );
  return lines.join("\n");
}

/** Run one workstream to completion, updating its ledger row and streaming events. */
async function dispatchOne(w: CrewWorkstream, emit: Emit, signal?: AbortSignal): Promise<void> {
  await updateWorkstream(w.id, "running", { stamp: "dispatched" });
  await emit({ type: "workstream", id: w.id, seq: w.seq, status: "running" });

  let sessionId: string | null = null;
  let workProductId: string | null = null;
  let workProduct: WorkProduct | null = null;
  let errored: string | null = null;

  try {
    await runAgent(
      composePrompt(w),
      async (e) => {
        switch (e.type) {
          case "session":
            sessionId = e.sessionId;
            break;
          case "step":
            await emit({ type: "step", workstreamId: w.id, step: e.step });
            break;
          case "work_product":
            workProductId = e.id;
            workProduct = e.workProduct;
            await emit({ type: "work_product", workstreamId: w.id, id: e.id, workProduct: e.workProduct });
            break;
          case "error":
            errored = e.message;
            break;
        }
      },
      signal
    );
  } catch (err) {
    errored = err instanceof Error ? err.message : String(err);
  }

  // A produced deliverable → Review (awaiting the owner's brief-quality tap), and
  // file it back into the graph as knowledge.
  if (workProduct && workProductId) {
    await updateWorkstream(w.id, "review", { sessionId, workProductId, stamp: "finished" });
    await emit({ type: "workstream", id: w.id, seq: w.seq, status: "review", sessionId, workProductId });
    try {
      const { sourceDoc } = await fileWorkProductBack(workProductId, workProduct);
      await emit({ type: "filed_back", workstreamId: w.id, sourceDoc });
    } catch (e) {
      // Filing back is best-effort — a ledger write must never fail the dispatch.
      console.error("fileWorkProductBack failed:", e);
    }
    return;
  }

  // No deliverable (agent produced nothing, or errored) → Needs input.
  const status: CrewStatus = "needs_input";
  await updateWorkstream(w.id, status, { sessionId, error: errored, stamp: "finished" });
  await emit({ type: "workstream", id: w.id, seq: w.seq, status, sessionId, error: errored });
}

/**
 * Dispatch every queued workstream of a run, honoring dependencies and the
 * concurrency limit (1 when parallel is off, MAX_PARALLEL when on). Runs in
 * dependency-ready batches so a dependent never starts before its prerequisites.
 */
export async function dispatchRun(
  runId: string,
  opts: { parallel: boolean },
  emit: Emit,
  signal?: AbortSignal
): Promise<void> {
  const run = await loadRun(runId);
  if (!run) {
    await emit({ type: "error", message: "That crew run no longer exists." });
    return;
  }

  await setRunStatus(runId, "dispatching");
  await emit({ type: "run_status", status: "dispatching" });

  const limit = opts.parallel ? MAX_PARALLEL : 1;

  // Prerequisites already satisfied: inline items and any card past the finish
  // line from a prior dispatch. Dependents unblock as prerequisites reach a
  // terminal state (review or needs_input) — never a deadlock.
  const satisfied = new Set<number>(
    run.workstreams
      .filter((w) => w.kind === "inline" || w.status === "review" || w.status === "done")
      .map((w) => w.seq)
  );
  const pending = run.workstreams.filter((w) => w.status === "queued");

  while (pending.length > 0) {
    if (signal?.aborted) break;

    let ready = pending.filter((w) => w.dependsOn.every((d) => satisfied.has(d)));
    // Break any dependency cycle / dangling dependency by forcing progress.
    if (ready.length === 0) ready = [pending[0]];

    const batch = ready.slice(0, limit);
    for (const w of batch) pending.splice(pending.indexOf(w), 1);

    await Promise.all(batch.map((w) => dispatchOne(w, emit, signal)));
    for (const w of batch) satisfied.add(w.seq);
  }

  await setRunStatus(runId, "done");
  await emit({ type: "run_status", status: "done" });
  await emit({ type: "done" });
}
