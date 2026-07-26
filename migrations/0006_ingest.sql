-- 0006_ingest.sql
-- Ingestion support: store the exact source passage on each fact, and keep a
-- per-file content-hash cache so re-runs skip files that haven't changed.
--
-- The facts table (0001) already records provenance (source_tool, source_doc,
-- doc_timestamp, content_hash). Ingestion is the first thing that writes to it,
-- so these two columns are purely additive — nothing else reads facts yet.

-- The verbatim text span the fact was extracted from. For CSV rows this is the
-- raw row; for emails/transcripts it is the exact quote the model returned,
-- which we verify is a real substring of the document before storing.
alter table facts add column if not exists source_quote text;

-- Character offset of source_quote within its source document (when known), so
-- the /facts page can highlight the passage in situ.
alter table facts add column if not exists source_offset integer;

-- Per-file ingest cache. Keyed by the source document (filename). If a file's
-- content hash matches what we last ingested, the whole file is skipped — no
-- LLM call, no re-write. A changed hash triggers a fresh extraction.
create table if not exists ingested_sources (
  source_doc    text primary key,       -- the file we ingested (e.g. an email filename)
  source_tool   source_tool not null,   -- which of the four tools it belongs to
  content_hash  text not null,          -- sha256 of the file's full contents
  fact_count    integer not null default 0,
  ingested_at   timestamptz not null default now()
);
