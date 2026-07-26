// Server-only: compute an answer's confidence from its evidence — nothing else.
//
// Confidence is a pure function of the CONNECTED evidence that was actually
// used. It never peeks at disconnected sources (they are unreachable by then),
// so when a source is revoked the score drops for an honest reason: the answer
// now rests on fewer, less-corroborated passages. That is the "visibly reduced
// confidence" of DEMO_SCRIPT Beat 6, earned rather than asserted.
import type { AskEnvelope, Claim, ConfidenceLabel, EvidenceItem, SourceTool } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function labelFor(confidence: number): ConfidenceLabel {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.55) return "Medium";
  return "Low";
}

/**
 * Score in [0.2, 0.98].
 *   corroboration — how many independent source tools back each claim
 *   breadth       — how many distinct sources the answer drew on overall
 *   sorBonus      — a ratified system-of-record for a touched scope is present
 *   degradedPenalty — a declared system-of-record is currently disconnected
 * A confident single-source answer is possible (Beat 3), but the ceiling for a
 * lone source is deliberately below that of a well-corroborated one.
 */
export function computeConfidence(args: {
  answerable: boolean;
  claims: Claim[];
  evidence: EvidenceItem[];
  degraded: boolean;
  hasRatifiedSoR: boolean;
}): number {
  const { answerable, claims, evidence, degraded, hasRatifiedSoR } = args;
  if (!answerable || evidence.length === 0 || claims.length === 0) return 0.2;

  const byId = new Map(evidence.map((e) => [e.id, e]));

  // Corroboration: average distinct-source support per cited claim (capped at 3).
  let corrobSum = 0;
  let citedClaims = 0;
  for (const c of claims) {
    const tools = new Set<SourceTool>();
    for (const id of c.evidence) {
      const e = byId.get(id);
      if (e) tools.add(e.sourceTool);
    }
    if (tools.size > 0) {
      corrobSum += Math.min(tools.size, 3) / 3;
      citedClaims++;
    }
  }
  const corrob = citedClaims > 0 ? corrobSum / citedClaims : 0; // 0..1

  // Breadth: distinct sources used across the whole answer (capped at 4).
  const usedTools = new Set(claims.flatMap((c) => c.evidence.map((id) => byId.get(id)?.sourceTool)).filter(Boolean));
  const breadth = Math.min(usedTools.size, 4) / 4; // 0..1

  // Fraction of claims that are actually grounded in ≥1 passage.
  const grounded = citedClaims / claims.length; // 0..1

  let score = 0.25 + 0.4 * corrob + 0.2 * breadth + 0.1 * grounded;
  if (hasRatifiedSoR && !degraded) score += 0.08;
  if (degraded) score -= 0.18; // a declared system-of-record is offline

  return clamp(score, 0.2, 0.98);
}

/** Attach confidence to a partially-built envelope. */
export function withConfidence(
  env: Omit<AskEnvelope, "confidence" | "confidenceLabel">,
  hasRatifiedSoR: boolean
): AskEnvelope {
  const confidence = computeConfidence({
    answerable: env.answerable,
    claims: env.claims,
    evidence: env.evidence,
    degraded: env.degraded != null,
    hasRatifiedSoR,
  });
  return { ...env, confidence, confidenceLabel: labelFor(confidence) };
}
