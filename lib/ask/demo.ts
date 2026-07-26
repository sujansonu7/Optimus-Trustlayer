// Server-only: seed the Ask box's suggested questions from DEMO_SCRIPT.md.
//
// DEMO_SCRIPT.md is the demo spec. Its "Suggested questions (runnable)" block —
// delimited by <!-- SUGGESTED_QUESTIONS:start/end --> — is the single source of
// truth for the chips shown on the home page. Each line is:
//   - <question> | beat:<n> | <one-line note>
// If the file or block is missing, we fall back to a small built-in set so the
// page still demos.
import fs from "node:fs";
import path from "node:path";

export type SuggestedQuestion = { question: string; beat: number | null; note: string };

const FALLBACK: SuggestedQuestion[] = [
  { question: "When does Cobalt Ridge Manufacturing renew?", beat: 4, note: "Conflict resolved by the declared system of record." },
  { question: "What is Quantum Peak Insurance's ARR?", beat: 4, note: "Recurring ARR vs. a bundled one-time figure." },
  { question: "Who owns the Thornbury & Cole account?", beat: 4, note: "Stale CRM owner vs. the corroborated current owner." },
  { question: "Is Grantline Media Group still an active customer?", beat: 4, note: "CRM says Active; the Sheet and email say Churned." },
];

let cache: SuggestedQuestion[] | null = null;

export function loadSuggestedQuestions(): SuggestedQuestion[] {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "DEMO_SCRIPT.md"), "utf8");
    const m = raw.match(/<!--\s*SUGGESTED_QUESTIONS:start\s*-->([\s\S]*?)<!--\s*SUGGESTED_QUESTIONS:end\s*-->/);
    if (!m) {
      cache = FALLBACK;
      return cache;
    }
    const items: SuggestedQuestion[] = [];
    for (const line of m[1].split("\n")) {
      const t = line.trim();
      if (!t.startsWith("- ")) continue;
      const parts = t.slice(2).split("|").map((p) => p.trim());
      const question = parts[0];
      if (!question) continue;
      const beatPart = parts.find((p) => /^beat:/i.test(p));
      const beat = beatPart ? Number(beatPart.replace(/beat:/i, "").trim()) || null : null;
      const note = parts.filter((p) => p !== question && !/^beat:/i.test(p)).join(" · ");
      items.push({ question, beat, note });
    }
    cache = items.length > 0 ? items : FALLBACK;
    return cache;
  } catch {
    cache = FALLBACK;
    return cache;
  }
}
