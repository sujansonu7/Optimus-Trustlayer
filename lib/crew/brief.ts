// Server-only: brief assembly — THE PRODUCT of the crew pipeline.
//
// For a confirmed workstream we assemble a brief the owner can read and trust
// BEFORE any agent runs: the goal, the arbitrated relevant context pulled from
// the graph (every line cited to its source passage), the constraints, and the
// done-criteria. Assembly is DETERMINISTIC and grounded — it reuses the exact
// Ask retrieval + arbitration (retrieve.ts), so the renewal date a brief states
// is the same winner /conflicts and Ask would show, never a second opinion. No
// model call here: the brief cannot hallucinate because it only restates
// arbitrated facts, each carrying its evidence id.
import { retrieve } from "@/lib/ask/retrieve";
import { ALL_TOOLS, type SourceTool } from "@/lib/ask/types";
import type { BriefClaim, CrewBrief, TriageItem } from "./types";

// How many non-canonical context lines (contacts, deals, commitments) to carry
// beyond the account basics — enough to be useful, few enough to stay tight.
const MAX_CONTEXT_EXTRAS = 8;

/**
 * Assemble the grounded brief for one workstream. Pulls the arbitrated context
 * relevant to the workstream's goal from the connected graph and cites every
 * line. Returns an envelope-carrying brief; when the graph has nothing to say,
 * returns a brief with an honest note and empty context (the workstream can
 * still be dispatched — the agent will report what it can and cannot find).
 */
export async function assembleBrief(
  item: TriageItem,
  connected: SourceTool[]
): Promise<CrewBrief> {
  // Retrieve against the workstream's own words. Title + goal gives the entity
  // matcher the account names and the attributes the workstream cares about.
  const queryText = `${item.title}. ${item.goal}`;
  const r = await retrieve(queryText, connected);

  const context: BriefClaim[] = [];

  // 1) Account basics: one cited line per arbitrated canonical value (owner, ARR,
  //    renewal date, status, tier). These are the spine of any account brief.
  const canonicalKeys = new Set<string>();
  for (const res of r.resolved) {
    const key = `${res.entity}::${res.attributeLabel}`;
    canonicalKeys.add(key);
    const ids = r.evidence
      .filter(
        (e) =>
          e.entity === res.entity &&
          e.attributeLabel === res.attributeLabel &&
          (e.status === "winner" || e.status === "current")
      )
      .map((e) => e.id);
    if (ids.length === 0) continue;
    const suffix = res.conflicted ? " (sources disagreed — arbitrated winner shown)" : "";
    context.push({
      text: `${res.entity} — ${res.attributeLabel}: ${res.currentValue}${suffix}`,
      evidence: ids,
    });
  }

  // 2) Context extras: the non-canonical, single-source facts (primary contact,
  //    industry, deal fields, commitments from calls/email) that flesh out the
  //    brief. Deduped by (entity, attribute, value) so repeats don't pile up.
  const seen = new Set<string>();
  let extras = 0;
  for (const e of r.evidence) {
    if (extras >= MAX_CONTEXT_EXTRAS) break;
    if (canonicalKeys.has(`${e.entity}::${e.attributeLabel}`)) continue; // already a basic
    const dedup = `${e.entity}::${e.attributeLabel}::${e.display}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    context.push({ text: `${e.entity} — ${e.attributeLabel}: ${e.display}`, evidence: [e.id] });
    extras++;
  }

  const note =
    r.matchedEntities.length === 0
      ? "No matching account was found in the connected graph for this workstream. The agent will report what it can gather and flag what it cannot."
      : r.degraded;

  return {
    goal: item.goal,
    context,
    constraints: item.constraints,
    doneCriteria: item.doneCriteria,
    matchedEntities: r.matchedEntities,
    evidence: r.evidence,
    conflicts: r.conflicts,
    freshness: r.freshness,
    declarations: r.declarations,
    connectedTools: r.connectedTools,
    disconnectedTools: ALL_TOOLS.filter((t) => !connected.includes(t)),
    note,
  };
}
