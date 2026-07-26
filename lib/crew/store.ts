// Server-only: persistence for /crew runs, their workstreams (the ledger board),
// the brief-quality instrumentation, and the Parallel setting.
//
// This is WORK state, not knowledge (mirrors lib/agent/library.ts). crew_runs +
// crew_workstreams are a disposable record of what was delegated and where each
// card landed. The knowledge a workstream PRODUCES lands in work_products and —
// on completion — files back into the fact ledger (lib/crew/fileback.ts). Wiping
// every crew row changes nothing about what TrustLayer knows.
import { getPool, query } from "@/lib/db";
import type {
  BriefQuality,
  BriefQualityStats,
  CrewBrief,
  CrewRun,
  CrewStatus,
  CrewWorkstream,
  TriageItem,
} from "./types";

/* ------------------------------------------------------------------ */
/* Row → domain mapping                                                */
/* ------------------------------------------------------------------ */

type WorkstreamRow = {
  id: string;
  run_id: string;
  seq: number;
  title: string;
  goal: string;
  kind: string;
  inline_answer: string | null;
  constraints_json: string[];
  done_criteria_json: string[];
  depends_on: number[];
  brief_json: CrewBrief | null;
  status: string;
  session_id: string | null;
  work_product_id: string | null;
  quality: string | null;
  error: string | null;
  updated_at: string | null;
};

function mapWorkstream(r: WorkstreamRow): CrewWorkstream {
  return {
    id: r.id,
    runId: r.run_id,
    seq: r.seq,
    title: r.title,
    goal: r.goal,
    kind: r.kind === "inline" ? "inline" : "workstream",
    inlineAnswer: r.inline_answer,
    constraints: Array.isArray(r.constraints_json) ? r.constraints_json : [],
    doneCriteria: Array.isArray(r.done_criteria_json) ? r.done_criteria_json : [],
    dependsOn: Array.isArray(r.depends_on) ? r.depends_on : [],
    brief: r.brief_json ?? null,
    status: (r.status as CrewStatus) ?? "queued",
    sessionId: r.session_id,
    workProductId: r.work_product_id,
    quality: (r.quality as BriefQuality | null) ?? null,
    error: r.error,
    updatedAt: r.updated_at,
  };
}

const WORKSTREAM_COLS = `id, run_id, seq, title, goal, kind, inline_answer,
  constraints_json, done_criteria_json, depends_on, brief_json, status,
  session_id, work_product_id, quality, error,
  to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at`;

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

/**
 * Persist a triaged brain-dump: one run plus its workstreams. Inline (trivial)
 * items are stored answered, in the 'inline' column; real workstreams are stored
 * 'queued' with their assembled brief, ready to dispatch on confirm. Never
 * dispatches — confirm-before-dispatch is enforced by keeping this write-only.
 */
export async function createRun(
  brainDump: string,
  items: TriageItem[],
  briefs: (CrewBrief | null)[]
): Promise<string> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into crew_runs (brain_dump, status) values ($1, 'triaged') returning id`,
      [brainDump]
    );
    const runId = rows[0].id;

    for (let seq = 0; seq < items.length; seq++) {
      const it = items[seq];
      const isInline = it.kind === "inline";
      await client.query(
        `insert into crew_workstreams
           (run_id, seq, title, goal, kind, inline_answer,
            constraints_json, done_criteria_json, depends_on, brief_json, status)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
        [
          runId,
          seq,
          it.title,
          it.goal,
          it.kind,
          isInline ? it.inlineAnswer ?? "" : null,
          JSON.stringify(it.constraints ?? []),
          JSON.stringify(it.doneCriteria ?? []),
          JSON.stringify(it.dependsOn ?? []),
          isInline ? null : JSON.stringify(briefs[seq] ?? null),
          isInline ? "inline" : "queued",
        ]
      );
    }

    await client.query("commit");
    return runId;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function loadRun(runId: string): Promise<CrewRun | null> {
  const runRes = await query<{ id: string; brain_dump: string; status: string; created_at: string }>(
    `select id, brain_dump, status,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
       from crew_runs where id = $1`,
    [runId]
  );
  const run = runRes.rows[0];
  if (!run) return null;

  const wsRes = await query<WorkstreamRow>(
    `select ${WORKSTREAM_COLS} from crew_workstreams where run_id = $1 order by seq`,
    [runId]
  );

  return {
    id: run.id,
    brainDump: run.brain_dump,
    status: (run.status as CrewRun["status"]) ?? "triaged",
    createdAt: run.created_at,
    workstreams: wsRes.rows.map(mapWorkstream),
  };
}

/** The most recent run, for the /crew board on load. */
export async function loadLatestRun(): Promise<CrewRun | null> {
  const { rows } = await query<{ id: string }>(
    `select id from crew_runs order by created_at desc limit 1`
  );
  if (rows.length === 0) return null;
  return loadRun(rows[0].id);
}

export async function getWorkstream(id: string): Promise<CrewWorkstream | null> {
  const { rows } = await query<WorkstreamRow>(
    `select ${WORKSTREAM_COLS} from crew_workstreams where id = $1`,
    [id]
  );
  return rows[0] ? mapWorkstream(rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

export async function setRunStatus(runId: string, status: CrewRun["status"]): Promise<void> {
  await query(`update crew_runs set status = $2, updated_at = now() where id = $1`, [runId, status]);
}

/** Move a card to a new column, optionally stamping dispatch/finish and results. */
export async function updateWorkstream(
  id: string,
  status: CrewStatus,
  patch?: {
    sessionId?: string | null;
    workProductId?: string | null;
    error?: string | null;
    stamp?: "dispatched" | "finished";
  }
): Promise<void> {
  // session_id / work_product_id are FKs. Both are written AFTER the agent run
  // finishes, by which point "Clear all agent sessions" (or "Clear library") can
  // already have removed the row we are about to point at — the same race that
  // was hardened for agent_steps in lib/agent/library.ts. Adopt only an id that
  // still exists; otherwise keep what's there (the ON DELETE SET NULL FK will
  // have nulled it). A bookkeeping write must never fail a delivered run.
  await query(
    `update crew_workstreams
        set status = $2,
            session_id = case
              when $3::uuid is null then session_id
              when exists (select 1 from agent_sessions where id = $3::uuid) then $3::uuid
              else session_id
            end,
            work_product_id = case
              when $4::uuid is null then work_product_id
              when exists (select 1 from work_products where id = $4::uuid) then $4::uuid
              else work_product_id
            end,
            error = $5,
            dispatched_at = case when $6 = 'dispatched' then now() else dispatched_at end,
            finished_at = case when $6 = 'finished' then now() else finished_at end,
            updated_at = now()
      where id = $1`,
    [
      id,
      status,
      patch?.sessionId ?? null,
      patch?.workProductId ?? null,
      patch?.error ?? null,
      patch?.stamp ?? null,
    ]
  );
}

/**
 * Record the owner's one-tap brief-quality verdict and move the card to Done.
 * Returns the updated running stats so the caller can echo the new percentage.
 */
export async function recordQuality(
  workstreamId: string,
  quality: BriefQuality
): Promise<BriefQualityStats> {
  await query(
    `update crew_workstreams
        set quality = $2, status = 'done', updated_at = now()
      where id = $1`,
    [workstreamId, quality]
  );
  return briefQualityStats();
}

/* ------------------------------------------------------------------ */
/* Brief-quality instrumentation                                       */
/* ------------------------------------------------------------------ */

/** Running brief-quality across every rated workstream, ever. */
export async function briefQualityStats(): Promise<BriefQualityStats> {
  const { rows } = await query<{ q: string; n: string }>(
    `select quality as q, count(*)::text as n
       from crew_workstreams
      where quality is not null
      group by quality`
  );
  let noCorrection = 0;
  let correction = 0;
  for (const r of rows) {
    if (r.q === "no_correction") noCorrection = Number(r.n);
    else if (r.q === "correction") correction = Number(r.n);
  }
  const rated = noCorrection + correction;
  return {
    rated,
    noCorrection,
    correction,
    pct: rated === 0 ? null : Math.round((noCorrection / rated) * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Parallel setting                                                    */
/* ------------------------------------------------------------------ */

export async function loadParallelEnabled(): Promise<boolean> {
  try {
    const { rows } = await query<{ parallel_enabled: boolean }>(
      `select parallel_enabled from crew_settings where id = true`
    );
    return rows[0]?.parallel_enabled ?? false;
  } catch {
    // crew_settings (migration 0013) not applied yet — default OFF.
    return false;
  }
}

export async function setParallelEnabled(enabled: boolean): Promise<void> {
  await query(
    `insert into crew_settings (id, parallel_enabled, updated_at)
       values (true, $1, now())
     on conflict (id) do update set parallel_enabled = excluded.parallel_enabled, updated_at = now()`,
    [enabled]
  );
}
