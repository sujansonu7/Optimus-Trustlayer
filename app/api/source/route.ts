// GET /api/source?doc=emails/xxx.txt — return the raw text of one source
// document so the /facts page can highlight the exact passage in context.
//
// Only email and transcript documents are served (the two LLM sources whose
// stored quotes are verbatim). Everything else — including the answer-key
// files the app must never read — is refused. Path traversal is blocked.
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_DIR = path.join(process.cwd(), "fixture");

export async function GET(req: Request): Promise<Response> {
  const doc = new URL(req.url).searchParams.get("doc") ?? "";

  // Allowlist: emails/<name>.txt or transcripts/<name>.txt, no slashes/dots
  // in the basename, no traversal.
  const m = doc.match(/^(emails|transcripts)\/([A-Za-z0-9._-]+\.txt)$/);
  if (!m || m[2].includes("..")) {
    return new Response("not found", { status: 404 });
  }

  const full = path.join(FIXTURE_DIR, m[1], m[2]);
  // Belt-and-suspenders: the resolved path must stay inside the fixture dir.
  if (!full.startsWith(FIXTURE_DIR + path.sep)) {
    return new Response("not found", { status: 404 });
  }

  try {
    const text = fs.readFileSync(full, "utf8");
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
