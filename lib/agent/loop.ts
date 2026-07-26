// Server-only: the minimal in-house agent loop.
//
// The whole engine is this: call the model with a system prompt and the four
// tools; the model picks a tool; we run it; the result goes back; repeat until
// the model stops calling tools (it has drafted the brief). Every turn emits a
// visible step — thought, tool call (with inputs), tool result summary — so the
// work is watchable. Nothing durable is kept here: the Session evidence pool and
// the message list live only for this call and are discarded when it returns.
// All knowledge is re-read from Postgres through the tools on every run.
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { connectedTools } from "@/lib/ask/sources";
import { ALL_TOOLS } from "@/lib/ask/types";
import { AGENT_TOOLS, Session, executeTool } from "./tools";
import { createSession, recordStep, finishSession, saveWorkProduct } from "./library";
import type { AgentStep, AgentToolName, WorkProduct } from "./types";

// A capable model — this is the reasoning that turns a request into cited work.
export const AGENT_MODEL = "claude-sonnet-5";
const MAX_TURNS = 12;

const SYSTEM_PROMPT = `You are TrustLayer's work agent. You do real work on the user's governed knowledge and hand back a formatted brief in which EVERY claim carries a citation to a source fact. You are watched: a human sees every step you take, so work transparently and in order.

You have five tools:
- query_graph(query): the workhorse. Returns the grounded envelope for a focused sub-question — the arbitrated CURRENT values, the exact citable passages (each with an evidence id), conflicts, freshness, and governing declarations. Only currently-connected sources are readable. Call it several times with NARROW queries (one account/topic each), not one broad query.
- read_source_passage(doc): read the raw text of one email/transcript to ground exact wording. Context only — you still cite facts by their evidence id.
- list_conflicts(entity?): discover which accounts have unresolved source disagreements, with the winner and rule. Use it to decide what to flag.
- execute_python(code, label?): COMPUTE. Runs Python in an isolated sandbox against 'graph.json' — a typed export of the WHOLE graph (accounts + deals, every value tagged with its evidence_id, arr as a number, dates as 'YYYY-MM-DD', snapshot_date = "today"). Use it whenever the task needs arithmetic over many accounts (totals, group-bys, revenue, a calendar) or a CHART. Print the numbers you'll cite AND the evidence_id behind each; draw charts with matplotlib. The sandbox has no database or network — only that JSON.
- draft_document(...): FINISH by assembling the brief as a FLAT list of claims — each claim has a section label, its text, and its supporting evidence ids. Call it exactly once, at the end.

RULES:
- Use ONLY facts from query_graph or values from the graph.json export (which carries the same evidence ids). Never use outside or prior knowledge. Never invent names, numbers, or dates.
- For a task that needs computation or a chart (a QBR revenue chart, a pipeline total by stage, a renewal calendar), call execute_python: load graph.json, compute, print each number with its evidence_id, and draw the chart. The chart attaches to the work product automatically. Then cite those same evidence_ids in your claims.
- EVERY claim in the brief must cite the evidence id(s) that support it. An uncited claim will be dropped, so always cite.
- When sources disagreed, the value marks a WINNER (arbitration already resolved it; the export shows contested:true). Use the winner's value and note the disagreement in the risks.
- Be honest about limits: if a declared system of record is disconnected, or a source is stale, say so in the risks.
- Work efficiently: a few query_graph and/or one or two execute_python calls are enough. Before drafting, take one short sentence to say what the brief will cover, then call draft_document ONCE with the COMPLETE brief — a flat list of claims, each with its section label and its citation ids already filled in. Never send an empty or placeholder draft; an empty draft is rejected and wastes a turn. Then stop.
- Keep the brief tight, factual, and useful to a busy account manager.`;

export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "step"; step: AgentStep }
  | { type: "work_product"; id: string; workProduct: WorkProduct }
  | { type: "done"; workProductId: string | null; sessionId: string }
  | { type: "error"; message: string };

function describeCall(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "query_graph":
      return `query_graph: “${String(i.query ?? "")}”`;
    case "read_source_passage":
      return `read_source_passage: ${String(i.doc ?? "")}`;
    case "list_conflicts":
      return `list_conflicts: ${i.entity ? String(i.entity) : "whole book"}`;
    case "execute_python":
      return `execute_python: ${i.label ? `“${String(i.label)}”` : "compute over the graph"}`;
    case "draft_document":
      return `draft_document: “${String(i.title ?? "brief")}”`;
    default:
      return name;
  }
}

/**
 * Run one work request to completion, emitting a step at every turn. Persists
 * the session, its steps, and — when the agent drafts — the work product.
 */
export async function runAgent(
  question: string,
  emit: (e: AgentEvent) => void | Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  // If the client already went away (e.g. a React StrictMode double-mount
  // aborted this run before it started), do nothing durable at all.
  if (signal?.aborted) return;

  const connected = await connectedTools();
  const disconnected = ALL_TOOLS.filter((t) => !connected.includes(t));
  const ctx = new Session(connected, disconnected);
  const generatedAt = new Date().toISOString();

  const sessionId = await createSession(question, "work");
  await emit({ type: "session", sessionId });

  let seq = 0;
  const step = async (s: Omit<AgentStep, "seq">): Promise<void> => {
    const full: AgentStep = { ...s, seq: seq++ };
    // Persistence is best-effort: a log write must never fail the run.
    await recordStep(sessionId, full).catch((e) => console.error("recordStep failed:", e));
    await emit({ type: "step", step: full });
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let workProductId: string | null = null;
  let saved: WorkProduct | null = null;
  let nudged = false; // have we already reminded the model to actually draft?

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Stop cleanly if the client disconnected mid-run — no more model calls,
      // no draft. Any session already opened is just a disposable run log.
      if (signal?.aborted) {
        await finishSession(sessionId, "done");
        return;
      }
      const resp = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: AGENT_TOOLS as Anthropic.Tool[],
        messages,
      });

      const usesTool = resp.stop_reason === "tool_use";

      // The model sometimes NARRATES its intent to draft ("Now I'll draft the
      // brief…") as closing text without actually calling draft_document — which
      // would end the run with no saved deliverable. If that happens and turns
      // remain, nudge it once to call the tool. So this closing text is really
      // still a mid-run thought, not the final word.
      const willNudge = !usesTool && !saved && !nudged && turn < MAX_TURNS - 1;

      // Surface the model's prose. Mid-run text is a "thought"; genuine closing
      // text (no tool call, nothing left to do) is the "final" line.
      for (const b of resp.content) {
        if (b.type === "text" && b.text.trim()) {
          await step({ kind: usesTool || willNudge ? "thought" : "final", summary: b.text.trim() });
        }
      }

      if (!usesTool) {
        if (willNudge) {
          nudged = true;
          messages.push({ role: "assistant", content: resp.content });
          messages.push({
            role: "user",
            content:
              "You haven't called draft_document yet, so nothing has been saved. Call draft_document now with the COMPLETE brief — a flat list of claims, each with its section label and the evidence id(s) that support it.",
          });
          continue;
        }
        break; // the model is genuinely done → run over
      }

      // Echo the assistant turn, then run each requested tool.
      messages.push({ role: "assistant", content: resp.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const b of resp.content) {
        if (b.type !== "tool_use") continue;
        await step({
          kind: "tool_call",
          toolName: b.name as AgentToolName,
          input: b.input,
          summary: describeCall(b.name, b.input),
        });
        const outcome = await executeTool(
          b.name,
          (b.input ?? {}) as Record<string, unknown>,
          ctx,
          question,
          generatedAt
        );
        await step({
          kind: "tool_result",
          toolName: b.name as AgentToolName,
          summary: outcome.summary,
          // execute_python streams its stdout and charts into the live timeline.
          // These ride on the emitted step only; recordStep never persists them.
          stdout: outcome.stdout,
          charts: outcome.charts,
        });
        toolResults.push({ type: "tool_result", tool_use_id: b.id, content: outcome.modelResult });

        if (outcome.workProduct && !saved) {
          saved = outcome.workProduct;
          workProductId = await saveWorkProduct(sessionId, outcome.workProduct);
          await emit({ type: "work_product", id: workProductId, workProduct: saved });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    await finishSession(sessionId, "done");
    await emit({ type: "done", workProductId, sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await step({ kind: "error", summary: message });
    await finishSession(sessionId, "error", message);
    await emit({ type: "error", message });
  }
}
