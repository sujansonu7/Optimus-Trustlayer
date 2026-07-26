// POST /api/ask — answer one question from the knowledge graph.
//
// Body: { question: string }. Returns the full AskEnvelope as JSON: prose,
// per-claim citations, freshness badges, any inline conflicts, confidence, and
// whether it was served from the belief cache. Node runtime (needs pg + the
// Anthropic SDK). One question in, one grounded envelope out.
import { ask } from "@/lib/ask/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  let question = "";
  try {
    const body = await req.json();
    question = typeof body?.question === "string" ? body.question : "";
  } catch {
    return json({ error: "Expected JSON body { question }." }, 400);
  }

  if (!question.trim()) {
    return json({ error: "Ask a question." }, 400);
  }
  if (question.length > 500) {
    return json({ error: "That question is too long — keep it under 500 characters." }, 400);
  }

  try {
    const envelope = await ask(question);
    return json(envelope, 200);
  } catch (err) {
    console.error("/api/ask failed:", err);
    return json(
      { error: err instanceof Error ? err.message : "Something went wrong answering that." },
      500
    );
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
