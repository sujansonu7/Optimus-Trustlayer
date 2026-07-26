// Server-only: pull structured facts out of ONE unstructured document (an
// email or a call transcript) using the Anthropic API.
//
// Design notes (kept deliberately boring):
//   * One API call per document. Keeps every passage traceable to one file,
//     keeps prompts tiny, and lets the ingest cache skip files by content hash.
//   * Cheapest capable model: claude-haiku-4-5. This extraction is bounded and
//     well-scoped, so Haiku's quality is close to Opus at ~1/5 the cost.
//   * We force a single tool call ("record_facts") via tool_choice so the model
//     can only answer as a list of facts — no prose to parse.
//   * Grounding is enforced in CODE, not trusted from the model: every returned
//     source_quote must appear verbatim in the document, or the fact is dropped.
import { anthropic } from "./anthropic";

// Cheapest model. Change here if you ever want to trade cost for accuracy.
export const EXTRACT_MODEL = "claude-haiku-4-5";

// Haiku 4.5 list price, USD per 1,000,000 tokens.
const PRICE_INPUT_PER_MTOK = 1.0;
const PRICE_OUTPUT_PER_MTOK = 5.0;

export type FactType =
  | "account"
  | "deal"
  | "renewal"
  | "pricing"
  | "commitment"
  | "person";

export type ExtractedFact = {
  fact_type: FactType;
  entity_name: string;
  attribute: string;
  value: string;
  value_json: unknown | null;
  source_quote: string;
  /** Character offset of source_quote within the document (>=0 once verified). */
  source_offset: number;
};

export type Usage = { input_tokens: number; output_tokens: number };

export type ExtractResult = {
  facts: ExtractedFact[];
  usage: Usage;
  /** Facts the model returned whose quote was NOT verbatim — dropped. */
  rejected: number;
};

export function usageCost(u: Usage): number {
  return (
    (u.input_tokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (u.output_tokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
  );
}

// The stable extraction instructions. Shared verbatim across every call.
const SYSTEM_PROMPT = `You extract atomic, verifiable business facts from a SINGLE document for a B2B SaaS vendor's knowledge base. The document is either a sales email or a call transcript.

Extract only these fact types:
  account     — an account/company attribute (owner, tier, industry, status)
  deal        — a deal/opportunity (stage, amount, product)
  renewal     — a renewal or contract date/term
  pricing     — a price, ARR, discount, or package
  commitment  — something a person promised or agreed to do
  person      — a person and their role/title/contact detail

RULES (follow exactly):
- Extract a fact ONLY if a specific span of the document literally states it. Never infer, summarize, combine spans, or use outside knowledge.
- "source_quote" MUST be copied VERBATIM from the document — the exact characters, including punctuation and casing. It must occur in the text word-for-word. If you cannot quote it verbatim, do not emit the fact.
- "entity_name" is the company or person the fact is about, spelled EXACTLY as the document spells it. Do NOT normalize, expand, or resolve aliases — that happens in a later step.
- One fact = one atomic claim. "Renewing June 30 at the same price" is TWO facts: a renewal-date fact and a pricing fact, each with its own quote.
- For dates and amounts, put the literal text in "value" and a normalized form in "value_json" (e.g. {"date":"2026-06-30"} or {"amount_usd":210000}). Use null for value_json when there is nothing to normalize.
- If the document states no extractable facts, return an empty list.`;

// Single tool. Forced via tool_choice so the model's only move is to return a
// record_facts call. Not marked strict: value_json is deliberately free-form,
// which strict structured-output validation can't express — grounding is
// enforced in code (verbatim-quote check) rather than by the schema validator.
const RECORD_FACTS_TOOL = {
  name: "record_facts",
  description: "Record the atomic facts extracted from the document.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            fact_type: {
              type: "string",
              enum: ["account", "deal", "renewal", "pricing", "commitment", "person"],
            },
            entity_name: { type: "string" },
            attribute: {
              type: "string",
              description: "short snake_case key, e.g. renewal_date, arr_usd, owner, deal_stage, role",
            },
            value: { type: "string" },
            value_json: {
              type: ["object", "null"],
              description: "normalized structured form of value, or null",
            },
            source_quote: {
              type: "string",
              description: "the exact verbatim span from the document that states this fact",
            },
          },
          required: ["fact_type", "entity_name", "attribute", "value", "source_quote"],
        },
      },
    },
    required: ["facts"],
  },
};

type RawFact = {
  fact_type: FactType;
  entity_name: string;
  attribute: string;
  value: string;
  value_json?: unknown;
  source_quote: string;
};

/**
 * Extract facts from one document. Never throws for "no facts"; only throws if
 * the API call itself fails (the caller decides whether to continue).
 */
export async function extractFacts(doc: {
  kind: "email" | "calls";
  text: string;
}): Promise<ExtractResult> {
  const kindLabel = doc.kind === "email" ? "EMAIL" : "CALL TRANSCRIPT";

  const response = await anthropic.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [RECORD_FACTS_TOOL],
    // Force the model to answer as a record_facts call, nothing else.
    tool_choice: { type: "tool", name: "record_facts" },
    messages: [
      {
        role: "user",
        content: `Document type: ${kindLabel}\n\n----- BEGIN DOCUMENT -----\n${doc.text}\n----- END DOCUMENT -----`,
      },
    ],
  });

  const usage: Usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  const raw: RawFact[] =
    toolBlock && toolBlock.type === "tool_use"
      ? ((toolBlock.input as { facts?: RawFact[] }).facts ?? [])
      : [];

  // Verbatim verification: keep only facts whose quote is a real substring of
  // the source document. This is the guarantee behind "tied to its exact
  // source passage" — enforced here, not trusted from the model.
  const facts: ExtractedFact[] = [];
  let rejected = 0;
  for (const f of raw) {
    const quote = (f.source_quote ?? "").trim();
    const offset = quote ? doc.text.indexOf(quote) : -1;
    if (!quote || offset === -1) {
      rejected++;
      continue;
    }
    facts.push({
      fact_type: f.fact_type,
      entity_name: (f.entity_name ?? "").trim(),
      attribute: (f.attribute ?? "").trim(),
      value: (f.value ?? "").trim(),
      value_json: f.value_json ?? null,
      source_quote: quote,
      source_offset: offset,
    });
  }

  return { facts, usage, rejected };
}
