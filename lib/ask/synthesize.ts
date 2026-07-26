// Server-only: the ONE Anthropic call that turns retrieved evidence into prose.
//
// Hard rules, enforced in the prompt AND in code:
//   * The model may use ONLY the numbered evidence we pass. No model knowledge,
//     no outside facts. If the evidence can't support an answer, it must say so
//     (answerable=false) rather than guess.
//   * Every claim must cite the evidence ids that support it. We drop any claim
//     with no valid citation, and any citation id that isn't in range — so a
//     hallucinated citation cannot survive into the envelope.
//   * When sources disagree, the model is told which value the arbitration rule
//     already chose (the winner-tagged evidence) and must answer with that.
// One call per question keeps it cheap, traceable, and easy to cache.
import { anthropic } from "@/lib/anthropic";
import type { Claim } from "./types";
import type { Retrieval } from "./retrieve";

// A capable model for the buyer-facing synthesis — this is the one call whose
// quality the whole demo rests on. Change here to trade cost for quality.
export const ASK_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are TrustLayer's answer engine. You answer a question using ONLY the numbered EVIDENCE passages provided — nothing else.

ABSOLUTE RULES:
- Use ONLY the evidence given. Never use outside or prior knowledge. Never invent facts, names, numbers, or dates.
- If the evidence does not contain enough to answer, set "answerable" to false and briefly say what is missing in "note". Do not guess.
- Every claim you make MUST cite the evidence id(s) that directly support it, in its "evidence" array. A claim with no supporting evidence id is not allowed.
- When two sources disagree about the same attribute, the evidence marks one value as the WINNER (an arbitration rule already resolved it). Answer with the WINNER's value, and it is good to note that sources disagreed. Never answer with a value marked "superseded" as if it were current.
- Keep the prose clean, direct, and plain — a sentence or two. No preamble, no "based on the evidence". Write the answer a busy account manager wants.
- Break the answer into atomic claims: one clear statement per claim, each with its citations. The "answer" field is a short readable synthesis of those claims.

Return your answer by calling the "answer" tool. Do not write anything outside the tool call.`;

const ANSWER_TOOL = {
  name: "answer",
  description: "Return the grounded answer as prose plus atomic, cited claims.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      answerable: {
        type: "boolean",
        description: "true only if the evidence supports an answer; false if it does not.",
      },
      answer: {
        type: "string",
        description: "Clean prose answer, one or two sentences. Empty string if not answerable.",
      },
      claims: {
        type: "array",
        description: "Atomic supported statements, each citing the evidence ids that back it.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string", description: "one atomic statement" },
            evidence: {
              type: "array",
              items: { type: "integer" },
              description: "evidence ids (numbers shown in EVIDENCE) that directly support this statement",
            },
          },
          required: ["text", "evidence"],
        },
      },
      note: {
        type: ["string", "null"],
        description: "Caveats, or what is missing when not answerable. null if nothing to add.",
      },
    },
    required: ["answerable", "answer", "claims", "note"],
  },
};

export type Synthesis = {
  answerable: boolean;
  answer: string;
  claims: Claim[];
  note: string | null;
};

// Render the evidence for the model: numbered, with arbitration status and the
// exact passage. Compact but complete.
function renderEvidence(r: Retrieval): string {
  if (r.evidence.length === 0) return "(no evidence — nothing is known from the connected sources)";
  return r.evidence
    .map((e) => {
      const tag =
        e.status === "winner"
          ? " [WINNER of a conflict]"
          : e.status === "superseded"
          ? " [SUPERSEDED — do not use as current]"
          : "";
      const passage = (e.sourceQuote ?? e.value).replace(/\s+/g, " ").trim();
      return `[${e.id}] ${e.entity} — ${e.attributeLabel}: ${e.display}${tag}
     source: ${e.sourceLabel} · ${e.sourceDoc} · ${e.ageText}
     passage: "${passage}"`;
    })
    .join("\n");
}

// A compact resolved view so the model knows the arbitrated current values.
function renderResolved(r: Retrieval): string {
  if (r.resolved.length === 0) return "";
  const lines = r.resolved.map(
    (rf) =>
      `- ${rf.entity} — ${rf.attributeLabel}: ${rf.currentValue}` +
      (rf.conflicted ? ` (sources disagreed; this is the arbitrated winner)` : ``)
  );
  return `\n\nRESOLVED CURRENT VALUES (already arbitrated — answer consistent with these):\n${lines.join("\n")}`;
}

export async function synthesize(r: Retrieval): Promise<Synthesis> {
  // No evidence at all → don't spend a call; answer honestly that we can't.
  if (r.evidence.length === 0) {
    return {
      answerable: false,
      answer: "",
      claims: [],
      note:
        r.connectedTools.length === 0
          ? "Every source is disconnected, so nothing can be answered right now."
          : "Nothing in the connected sources matches this question.",
    };
  }

  const userContent =
    `QUESTION: ${r.question}\n\n` +
    `EVIDENCE (cite by the [id] in brackets):\n${renderEvidence(r)}` +
    renderResolved(r);

  const response = await anthropic.messages.create({
    model: ASK_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [ANSWER_TOOL],
    tool_choice: { type: "tool", name: "answer" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  const raw =
    block && block.type === "tool_use"
      ? (block.input as { answerable?: boolean; answer?: string; claims?: { text?: string; evidence?: number[] }[]; note?: string | null })
      : {};

  // Ground the result in CODE: keep only citations that point at real evidence.
  const validIds = new Set(r.evidence.map((e) => e.id));
  const claims: Claim[] = [];
  for (const c of raw.claims ?? []) {
    const text = (c.text ?? "").trim();
    if (!text) continue;
    const evidence = Array.from(new Set((c.evidence ?? []).filter((id) => validIds.has(id))));
    if (evidence.length === 0) continue; // an uncited claim is dropped, not shown
    claims.push({ text, evidence });
  }

  // If the model claimed answerable but nothing survived grounding, downgrade.
  const answerable = Boolean(raw.answerable) && claims.length > 0;
  const answer = answerable ? (raw.answer ?? "").trim() : "";
  const note =
    typeof raw.note === "string" && raw.note.trim()
      ? raw.note.trim()
      : answerable
      ? null
      : "The connected evidence doesn't support a confident answer to this question.";

  return { answerable, answer, claims, note };
}
