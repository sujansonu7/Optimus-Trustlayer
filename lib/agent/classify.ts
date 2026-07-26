// Route an incoming request: a simple question, or a work request?
//
// A SIMPLE question wants one grounded answer ("when does Silverline renew?") —
// it goes through the existing Ask path unchanged. A WORK request asks the agent
// to DO something and produce a deliverable ("prep me for the Silverline renewal
// call", "draft the QBR numbers", "put together a brief on Nova"). Those run the
// visible agent loop and save a work product to /library.
//
// This is deliberately a boring, deterministic heuristic — no model call, so it
// is free, instant, and predictable in a live demo. It errs toward SIMPLE: a
// request only becomes WORK when it clearly asks for a produced artifact or a
// multi-part "do this" instruction. The UI always lets the human override.
import type { AskMode } from "./types";

// Verbs that ask the agent to PRODUCE or ASSEMBLE something.
const PRODUCE_VERBS =
  /\b(prep|prepare|draft|write(?:\s+up)?|assemble|compile|put\s+together|build|create|generate|pull\s+together|brief\s+me|get\s+me\s+ready|make\s+me)\b/i;

// Deliverable nouns / contexts that signal a work product is expected.
const DELIVERABLE =
  /\b(brief|briefing|prep|one[-\s]?pager|summary|write[-\s]?up|deck|qbr|report|packet|memo|talking\s+points|call|meeting|renewal|kickoff|review)\b/i;

// Strong standalone phrases that are always work, regardless of nouns.
const STRONG =
  /\b(prep\s+me|brief\s+me|get\s+me\s+ready|prepare\s+(?:me|for)|put\s+together|draft\s+(?:a|the|me)|write\s+up|talking\s+points)\b/i;

export function classify(question: string): AskMode {
  const q = question.trim();
  if (!q) return "simple";

  if (STRONG.test(q)) return "work";

  // A produce-verb plus a deliverable/context noun => work.
  if (PRODUCE_VERBS.test(q) && DELIVERABLE.test(q)) return "work";

  // "and"-joined multi-part instructions with a produce verb (a brain-dump) —
  // "check the discount, confirm the date, and draft the numbers".
  if (PRODUCE_VERBS.test(q) && /,|\band\b/i.test(q) && q.split(/\s+/).length >= 8) {
    return "work";
  }

  return "simple";
}
