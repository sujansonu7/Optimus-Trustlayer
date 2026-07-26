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

You have four tools:
- query_graph(query): the workhorse. Returns the grounded envelope for a focused sub-question — the arbitrated CURRENT values, the exact citable passages (each with an evidence id), conflicts, freshness, and governing declarations. Only currently-connected sources are readable. Call it several times with NARROW queries (one account/topic each), not one broad query.
- read_source_passage(doc): read the raw text of one email/transcript to ground exact wording. Context only — you still cite facts by their evidence id.
- list_conflicts(entity?): discover which accounts have unresolved source disagreements, with the winner and rule. Use it to decide what to flag.
- draft_document(...): FINISH by assembling the brief as a FLAT list of claims — each claim has a section label, its text, and its supporting evidence ids. Call it exactly once, at the end.

RULES:
- Use ONLY facts returned by query_graph. Never use outside or prior knowledge. Never invent names, numbers, or dates.
- EVERY claim in the brief must cite the evidence id(s) that support it. An uncited claim will be dropped, so always cite.
- When sources disagreed, the envelope marks a WINNER (arbitration already resolved it). Use the winner's value and note the disagreement in the risks.
- Be honest about limits: if a declared system of record is disconnected, or a source is stale, say so in the risks.
- Work efficiently: usually 3–6 query_graph calls are enough. Before drafting, take one short sentence to say what the brief will cover, then call draft_document ONCE with the COMPLETE brief — a flat list of claims, each with its section label and its citation ids already filled in. Never send an empty or placeholder draft; an empty draft is rejected and wastes a turn. Then stop.
- Keep the brief tight, factual, and useful to a busy account manager preparing for a call.`;

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

      // Surface the model's prose. Mid-run text is a "thought"; the closing text
      // (no tool call) is the "final" line.
      for (const b of resp.content) {
        if (b.type === "text" && b.text.trim()) {
          await step({ kind: usesTool ? "thought" : "final", summary: b.text.trim() });
        }
      }

      if (!usesTool) break; // the model is done talking → run over

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
        await step({ kind: "tool_result", toolName: b.name as AgentToolName, summary: outcome.summary });
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
