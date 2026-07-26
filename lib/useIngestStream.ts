"use client";

// The live-build engine behind BOTH the /admin ingest panel and the
// /onboarding "watch it build" step. It POSTs to /api/ingest, reads the NDJSON
// progress stream, and maintains the per-file cards + running counters. Kept in
// one place so the two surfaces render the exact same build, honestly.
//
// Event shape mirrors lib/ingest.ts IngestEvent structurally (not imported, to
// keep this a pure client bundle with no server deps).
import { useCallback, useRef, useState } from "react";

export type SourceTool = "crm" | "spreadsheet" | "email" | "calls";

export type IngestEvent =
  | { type: "start"; totalDocs: number; budgetUsd: number }
  | { type: "file_start"; doc: string; tool: SourceTool; kind: "csv" | "llm" }
  | { type: "file_skip"; doc: string; tool: SourceTool; factCount: number }
  | { type: "fact"; doc: string; entity: string; attribute: string; value: string; factType: string }
  | { type: "file_done"; doc: string; tool: SourceTool; extracted: number; rejected: number; costUsd: number }
  | { type: "budget_reached"; spentUsd: number; skipped: string[] }
  | { type: "done"; totals: { docs: number; facts: number; rejected: number; skippedFiles: number; costUsd: number } }
  | { type: "error"; doc?: string; message: string };

export type FileCard = {
  doc: string;
  tool: SourceTool;
  kind: "csv" | "llm";
  status: "running" | "done" | "skipped" | "error";
  extracted: number;
  rejected: number;
  costUsd: number;
  error?: string;
  facts: { entity: string; attribute: string; value: string }[];
};

export type IngestCounts = { facts: number; rejected: number; cost: number; skipped: number; done: number };
export type IngestBanner = { kind: "budget" | "done" | "error"; text: string } | null;

export type DoneTotals = { docs: number; facts: number; rejected: number; skippedFiles: number; costUsd: number };

export function useIngestStream(opts?: {
  defaultBudget?: number;
  onDone?: (totals: DoneTotals) => void;
}) {
  const [running, setRunning] = useState(false);
  const [totalDocs, setTotalDocs] = useState(0);
  const [budgetUsd, setBudgetUsd] = useState(opts?.defaultBudget ?? 3);
  const [cards, setCards] = useState<FileCard[]>([]);
  const [counts, setCounts] = useState<IngestCounts>({ facts: 0, rejected: 0, cost: 0, skipped: 0, done: 0 });
  const [banner, setBanner] = useState<IngestBanner>(null);
  const cardsRef = useRef<Map<string, FileCard>>(new Map());
  const onDoneRef = useRef(opts?.onDone);
  onDoneRef.current = opts?.onDone;

  const upsertCard = useCallback(
    (doc: string, mut: (c: FileCard) => void, seed?: Partial<FileCard>) => {
      const map = cardsRef.current;
      let c = map.get(doc);
      if (!c) {
        c = {
          doc,
          tool: seed?.tool ?? "email",
          kind: seed?.kind ?? "llm",
          status: "running",
          extracted: 0,
          rejected: 0,
          costUsd: 0,
          facts: [],
        };
        map.set(doc, c);
      }
      mut(c);
      setCards(Array.from(map.values()));
    },
    []
  );

  const handleEvent = useCallback(
    (ev: IngestEvent) => {
      switch (ev.type) {
        case "start":
          setTotalDocs(ev.totalDocs);
          setBudgetUsd(ev.budgetUsd);
          break;
        case "file_start":
          upsertCard(ev.doc, (c) => { c.status = "running"; c.tool = ev.tool; c.kind = ev.kind; }, { tool: ev.tool, kind: ev.kind });
          break;
        case "file_skip":
          upsertCard(ev.doc, (c) => { c.status = "skipped"; c.tool = ev.tool; c.extracted = ev.factCount; }, { tool: ev.tool });
          setCounts((p) => ({ ...p, skipped: p.skipped + 1 }));
          break;
        case "fact":
          upsertCard(ev.doc, (c) => {
            if (c.facts.length < 6) c.facts.push({ entity: ev.entity, attribute: ev.attribute, value: ev.value });
          });
          setCounts((p) => ({ ...p, facts: p.facts + 1 }));
          break;
        case "file_done":
          upsertCard(ev.doc, (c) => {
            c.status = "done"; c.extracted = ev.extracted; c.rejected = ev.rejected; c.costUsd = ev.costUsd;
          });
          setCounts((p) => ({ ...p, rejected: p.rejected + ev.rejected, cost: p.cost + ev.costUsd, done: p.done + 1 }));
          break;
        case "budget_reached":
          setBanner({ kind: "budget", text: `Budget cap reached after $${ev.spentUsd.toFixed(3)} — ${ev.skipped.length} document(s) left unprocessed. Raise the cap and re-run to finish.` });
          break;
        case "done":
          setBanner({
            kind: "done",
            text: `Done — ${ev.totals.facts} facts from ${ev.totals.docs} file(s), ${ev.totals.skippedFiles} unchanged file(s) skipped, ${ev.totals.rejected} unverifiable quote(s) dropped. Cost this run: $${ev.totals.costUsd.toFixed(3)}.`,
          });
          onDoneRef.current?.(ev.totals);
          break;
        case "error":
          if (ev.doc) {
            upsertCard(ev.doc, (c) => { c.status = "error"; c.error = ev.message; });
          } else {
            setBanner({ kind: "error", text: ev.message });
          }
          break;
      }
    },
    [upsertCard]
  );

  const run = useCallback(
    async (force: boolean, budget?: number) => {
      if (running) return;
      const budgetToUse = budget ?? budgetUsd;
      cardsRef.current = new Map();
      setCards([]);
      setCounts({ facts: 0, rejected: 0, cost: 0, skipped: 0, done: 0 });
      setBanner(null);
      setRunning(true);
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budgetUsd: budgetToUse, force }),
        });
        if (!res.ok || !res.body) throw new Error(`Ingest failed (HTTP ${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) handleEvent(JSON.parse(line) as IngestEvent);
          }
        }
        if (buf.trim()) handleEvent(JSON.parse(buf) as IngestEvent);
      } catch (err) {
        setBanner({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      } finally {
        setRunning(false);
      }
    },
    [running, budgetUsd, handleEvent]
  );

  return { running, totalDocs, budgetUsd, setBudgetUsd, cards, counts, banner, run };
}
