// POST /api/agent — run a work request through the visible agent loop, streaming
// every step to the browser as Server-Sent Events.
//
// Body: { question }. The response is an event stream; each `data:` line is one
// AgentEvent (session id, a step, done, or error). The browser renders steps
// live — the visible work IS the trust story. Node runtime (needs pg + the SDK).
import { runAgent, type AgentEvent } from "@/lib/agent/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  let question = "";
  try {
    const body = await req.json();
    question = typeof body?.question === "string" ? body.question : "";
  } catch {
    return new Response("Expected JSON body { question }.", { status: 400 });
  }
  if (!question.trim()) return new Response("Ask a question.", { status: 400 });
  if (question.length > 500) return new Response("That request is too long.", { status: 400 });

  const encoder = new TextEncoder();
  // Bridge client disconnect → runAgent abort, so a cancelled request (e.g. a
  // React StrictMode double-mount) stops the run before it does durable work.
  const ac = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true; // consumer went away mid-write
        }
      };
      try {
        await runAgent(question, send, ac.signal);
      } catch (err) {
        // runAgent handles its own errors, but guard the stream regardless.
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
