// POST /api/crew/triage — split a brain-dump into workstreams and assemble a
// grounded brief for each, WITHOUT dispatching anything.
//
// Body: { brainDump }. Returns { run, note }: the persisted run with its board
// (inline items already answered, workstreams queued with their briefs) plus
// triage's one-line reading. The owner reviews the plan and the briefs, then
// calls /api/crew/dispatch to confirm — nothing runs until they do.
import { connectedTools } from "@/lib/ask/sources";
import { triageBrainDump } from "@/lib/crew/triage";
import { assembleBrief } from "@/lib/crew/brief";
import { createRun, loadRun } from "@/lib/crew/store";
import type { CrewBrief } from "@/lib/crew/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  let brainDump = "";
  try {
    const body = await req.json();
    brainDump = typeof body?.brainDump === "string" ? body.brainDump : "";
  } catch {
    return Response.json({ error: "Expected JSON body { brainDump }." }, { status: 400 });
  }
  brainDump = brainDump.trim();
  if (!brainDump) return Response.json({ error: "Type a brain-dump first." }, { status: 400 });
  if (brainDump.length > 2000) return Response.json({ error: "That brain-dump is too long." }, { status: 400 });

  try {
    const connected = await connectedTools();
    const triage = await triageBrainDump(brainDump, connected);

    // Assemble a grounded brief for each real workstream (inline items need none).
    const briefs: (CrewBrief | null)[] = await Promise.all(
      triage.items.map((it) => (it.kind === "workstream" ? assembleBrief(it, connected) : Promise.resolve(null)))
    );

    const runId = await createRun(brainDump, triage.items, briefs);
    const run = await loadRun(runId);
    return Response.json({ run, note: triage.note });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
