// POST /api/ingest — run a full ingest and stream progress as NDJSON.
//
// Each line of the response body is one JSON IngestEvent. The /admin page reads
// the stream and renders the build live. Node runtime (needs fs + pg).
import { runIngest, DEFAULT_BUDGET_USD } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // Optional knobs: { budgetUsd?: number, force?: boolean }
  let budgetUsd = DEFAULT_BUDGET_USD;
  let force = false;
  try {
    const body = await req.json();
    if (typeof body?.budgetUsd === "number") budgetUsd = body.budgetUsd;
    if (typeof body?.force === "boolean") force = body.force;
  } catch {
    /* no body — use defaults */
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runIngest({ budgetUsd, force })) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              message: err instanceof Error ? err.message : String(err),
            }) + "\n"
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
