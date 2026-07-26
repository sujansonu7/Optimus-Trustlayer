// Server-only: read the fact ledger for the /facts page.
import { query } from "./db";

export type FactRow = {
  id: string;
  entity_ref: string;
  attribute: string;
  value: string;
  source_tool: string;
  source_doc: string;
  doc_timestamp: string | null;
  content_hash: string;
  source_quote: string | null;
  source_offset: number | null;
  recorded_at: string;
};

/** Every currently-believed (not-superseded) fact, newest first. */
export async function loadFacts(): Promise<FactRow[]> {
  const { rows } = await query<FactRow>(
    `select id, entity_ref, attribute, value, source_tool, source_doc,
            doc_timestamp, content_hash, source_quote, source_offset, recorded_at
       from facts
      where superseded_at is null
      order by entity_ref, attribute, recorded_at desc`
  );
  return rows;
}
