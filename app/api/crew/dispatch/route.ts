// POST /api/crew/dispatch — confirm and run a triaged crew run, streaming ledger
// updates as Server-Sent Events.
//
// Body: { runId }. Each `data:` line is one CrewDispatchEvent — a run/workstream
// status change, a passthrough agent step, a produced work product, or a
// file-back confirmation — so the kanban board and the live agent timeline move
// in real time. This is the ONLY entry point that actually runs work, and it
// only runs what was already triaged and confirmed by the owner clicking dispatch.
// Node runtime (needs pg + the SDK).
import { dispatchRun, type CrewDispatchEvent } from "@/lib/crew/dispatch";
import { loadParallelEnabled } from "@/lib/crew/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  let runId = "";
  try {
    const body = await req.json();
    runId = typeof body?.runId === "string" ? body.runId : "";
  } catch {
    return new Response("Expected JSON body { runId }.", { status: 400 });
  }
  if (!runId.trim()) return new Response("Missing runId.", { status: 400 });

  const parallel = await loadParallelEnabled();

  const encoder = new TextEncoder();
  // Bridge client disconnect → dispatch abort, so a cancelled request stops
  // between workstreams instead of running the whole plan into the void.
  const ac = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: CrewDispatchEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await dispatchRun(runId, { parallel }, send, ac.signal);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by cancel() */
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
