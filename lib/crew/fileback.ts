// Server-only: file a completed work product BACK into the graph.
//
// A delivered brief is not a dead end — it becomes knowledge. When a workstream
// finishes, we append ONE fact to the ledger recording that TrustLayer produced
// this work product, tagged with the 'work_product' provenance source (added in
// migration 0013). It carries the same discipline as any ingested fact: a source,
// a document path, a timestamp, and a content hash over the deliverable, plus the
// envelope pointer in value_json.
//
// Two invariants keep this safe:
//   * The attribute is 'crew_work_product' — NOT a canonical attribute — so it is
//     never arbitrated and can never manufacture a conflict against real records
//     (see lib/conflicts/normalize.ts: only known synonyms canonicalize).
//   * The 'work_product' source is not a connectable ingestion tool, so the graph
//     export and Ask retrieval (which read only connected tools) never fold these
//     rows back into compute — no feedback loop into arbitration.
// It is append-only: a new deliverable inserts a new row; nothing is overwritten.
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import type { WorkProduct } from "@/lib/agent/types";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Append a fact recording a delivered work product. `workProductId` is the row in
 * work_products; `sourceDoc` (work-products/<id>) becomes the fact's document.
 * Returns the fact id and the source-doc path. Best-effort at the call site:
 * filing back must never fail the dispatch that produced the brief.
 */
export async function fileWorkProductBack(
  workProductId: string,
  wp: WorkProduct
): Promise<{ factId: string; sourceDoc: string }> {
  const entity = wp.entity && wp.entity.trim() ? wp.entity.trim() : "Book of business";
  const sourceDoc = `work-products/${workProductId}`;
  const totalClaims = wp.sections.reduce((n, s) => n + s.claims.length, 0);

  // The passage we file is the deliverable's executive summary — the human-
  // readable gist — with the full envelope reachable via value_json.
  const passage = wp.summary?.trim() || wp.title;
  const contentHash = sha256(JSON.stringify(wp));

  const valueJson = {
    source: "TrustLayer work product",
    work_product_id: workProductId,
    title: wp.title,
    summary: wp.summary,
    cited_claims: totalClaims,
    source_passages: wp.evidence.length,
    computations: wp.computations?.length ?? 0,
    generated_at: wp.generatedAt,
  };

  const { rows } = await query<{ id: string }>(
    `insert into facts
       (entity_ref, attribute, value, value_json,
        source_tool, source_doc, doc_timestamp, content_hash,
        source_quote, source_offset, fact_type)
     values ($1,$2,$3,$4::jsonb,'work_product',$5, now(), $6, $7, null, 'work_product')
     returning id`,
    [entity, "crew_work_product", wp.title, JSON.stringify(valueJson), sourceDoc, contentHash, passage]
  );

  return { factId: rows[0].id, sourceDoc };
}
