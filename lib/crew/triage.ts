// Server-only: triage — the split step.
//
// Takes a messy brain-dump ("prep Northwind renewal, check the Meridian pricing
// exception, chase Coastal's contract status, draft the QBR agenda") and carves
// it into OUTCOME-SHAPED workstreams. Trivial items (a generic template, a
// reformat) are answered INLINE right here; anything that needs the customer's
// real data becomes a workstream to dispatch. Dependents are sequenced.
//
// This is the ONE model call in the crew pipeline that reasons about intent.
// Brief assembly (brief.ts) is deterministic and grounded; dispatch reuses the
// existing agent loop. Triage never touches the graph and never dispatches — it
// only proposes the split, which the owner confirms before anything runs.
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { SOURCE_SHORT, type SourceTool } from "@/lib/ask/types";
import type { TriageItem, TriageResult } from "./types";

// The reasoning that turns a messy brain-dump into structured, sequenced
// workstreams. The owner reviews and confirms the split before anything runs
// (confirm-before-dispatch). Brief assembly (brief.ts) uses no model at all.
export const TRIAGE_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are TrustLayer's crew dispatcher. The owner hands you a messy brain-dump of things on their plate. Split it into OUTCOME-SHAPED workstreams — each one a single deliverable or a single resolved question — and decide which are trivial enough to answer inline versus which need real work on the customer's knowledge.

Rules:
- One outcome per workstream. Give it a short, outcome-shaped title (e.g. "Northwind renewal prep", not "look at Northwind") and a one-sentence goal describing what "done" looks like.
- kind = "inline" ONLY when the item is genuinely trivial AND needs NO customer-specific facts — a generic template, a reformat, a scheduling note, boilerplate. For an inline item, put a short, directly useful answer in inlineAnswer (a few lines at most). Anything that needs the account's real data — renewal dates, pricing/discount exceptions, contract or deal status, ARR, ownership — is kind = "workstream", never inline. When unsure, choose "workstream": it is safer to assemble a grounded brief than to guess inline.
- Sequence dependents. If one workstream's output feeds another (a QBR agenda that summarizes a renewal prep; a summary that waits on the numbers), set dependsOn to the array of prerequisite workstream indexes (0-based, in the order you return them). Independent workstreams have an empty dependsOn.
- constraints: any explicit limits or conditions the owner implied ("only if the exception still applies", "keep it to one page"). Omit if none.
- doneCriteria: 1–3 concrete checks that define done for that workstream.
- Preserve the owner's intent faithfully. Do not invent tasks that aren't in the brain-dump, and do not drop any.
- note: one short sentence on how you read the brain-dump.

Call propose_workstreams exactly once with the full split.`;

const TRIAGE_TOOL: Anthropic.Tool = {
  name: "propose_workstreams",
  description: "Return the brain-dump split into outcome-shaped workstreams, sequenced, with trivial items answered inline.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      note: { type: "string", description: "One short sentence on how you read the brain-dump." },
      items: {
        type: "array",
        description: "The workstreams, in dispatch-friendly order (prerequisites before dependents where possible).",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "Short, outcome-shaped title." },
            goal: { type: "string", description: "One sentence: what done looks like." },
            kind: { type: "string", enum: ["workstream", "inline"], description: "inline only for trivial, data-free items." },
            inlineAnswer: {
              type: ["string", "null"],
              description: "For kind=inline: a short, directly useful answer. Null for workstreams.",
            },
            constraints: { type: "array", items: { type: "string" }, description: "Explicit limits/conditions, if any." },
            doneCriteria: { type: "array", items: { type: "string" }, description: "1–3 checks that define done." },
            dependsOn: {
              type: "array",
              items: { type: "integer" },
              description: "Indexes (0-based) of prerequisite workstreams this one waits on. Empty if independent.",
            },
          },
          required: ["title", "goal", "kind", "constraints", "doneCriteria", "dependsOn"],
        },
      },
    },
    required: ["items", "note"],
  },
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}
function intList(v: unknown): number[] {
  return Array.isArray(v) ? Array.from(new Set(v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0))) : [];
}

/**
 * Split a brain-dump into workstreams. Returns the proposed split only — the
 * caller assembles briefs and shows the plan for confirmation; nothing is
 * dispatched here.
 */
export async function triageBrainDump(
  brainDump: string,
  connected: SourceTool[]
): Promise<TriageResult> {
  const sources =
    connected.length > 0
      ? `Connected knowledge sources right now: ${connected.map((t) => SOURCE_SHORT[t]).join(", ")}.`
      : "No knowledge sources are connected right now.";

  const resp = await anthropic.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [TRIAGE_TOOL],
    tool_choice: { type: "tool", name: "propose_workstreams" },
    messages: [{ role: "user", content: `${sources}\n\nBrain-dump:\n${brainDump}` }],
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_workstreams"
  );
  if (!toolUse) {
    throw new Error("Triage did not return a split. Try rephrasing the brain-dump.");
  }

  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(input.items) ? input.items : [];

  const items: TriageItem[] = rawItems
    .map((raw): TriageItem | null => {
      const it = raw as Record<string, unknown>;
      const title = str(it.title);
      const goal = str(it.goal) || title;
      if (!title) return null;
      const kind = it.kind === "inline" ? "inline" : "workstream";
      const inlineAnswer = kind === "inline" ? str(it.inlineAnswer) || null : null;
      return {
        title,
        goal,
        kind,
        inlineAnswer,
        constraints: strList(it.constraints),
        doneCriteria: strList(it.doneCriteria),
        dependsOn: intList(it.dependsOn),
      };
    })
    .filter((x): x is TriageItem => x !== null);

  // Sanitize dependencies: drop self-references and out-of-range indexes that
  // survived the model, so sequencing can never deadlock the dispatcher.
  const n = items.length;
  for (let i = 0; i < n; i++) {
    items[i].dependsOn = items[i].dependsOn.filter((d) => d >= 0 && d < n && d !== i);
  }

  if (items.length === 0) {
    throw new Error("Triage found no actionable items in that brain-dump.");
  }

  return { items, note: str(input.note) || null };
}
