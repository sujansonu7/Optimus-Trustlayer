// Server-only helpers that read the raw Meridian Analytics fixture from disk.
// This module contains NO resolution or conflict-detection logic — it exists
// purely to surface the raw source data for the /sources page.
import fs from "node:fs";
import path from "node:path";

const FIXTURE_DIR = path.join(process.cwd(), "fixture");

// --- Minimal RFC-4180-ish CSV parser (handles quoted fields, "" escapes) ---
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else if (c === "\r") {
      // ignore; handled by \n
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  const headers = nonEmpty.shift() ?? [];
  return { headers, rows: nonEmpty };
}

function readIfExists(p: string): string | null {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

export type CsvTable = { headers: string[]; rows: string[][] };

export function readCsvFile(name: string): CsvTable {
  const text = readIfExists(path.join(FIXTURE_DIR, name));
  if (!text) return { headers: [], rows: [] };
  return parseCsv(text);
}

// --- Emails ---
export type EmailMsg = {
  file: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  ts: number; // for sorting; NaN-safe
  body: string;
};

function parseEmail(file: string, text: string): EmailMsg {
  const lines = text.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") { i++; break; }
    const m = line.match(/^([A-Za-z-]+):\s?(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  const body = lines.slice(i).join("\n").trim();
  const dateStr = headers["date"] ?? "";
  const ts = Date.parse(dateStr);
  return {
    file,
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    cc: headers["cc"],
    subject: headers["subject"] ?? "(no subject)",
    date: dateStr,
    ts: Number.isNaN(ts) ? 0 : ts,
    body,
  };
}

export function readEmails(): EmailMsg[] {
  const dir = path.join(FIXTURE_DIR, "emails");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch { return []; }
  const emails = files.map((f) => parseEmail(f, fs.readFileSync(path.join(dir, f), "utf8")));
  // newest first
  emails.sort((a, b) => b.ts - a.ts);
  return emails;
}

// --- Transcripts ---
export type Turn = { speaker: string; text: string };
export type Transcript = {
  file: string;
  meta: Record<string, string>;
  title: string; // first meta-ish line
  headerRaw: string;
  turns: Turn[];
  ts: number;
};

function parseTranscript(file: string, text: string): Transcript {
  const parts = text.replace(/\r\n/g, "\n").split(/\n\n+/);
  const headerRaw = parts.shift() ?? "";
  const meta: Record<string, string> = {};
  let title = "";
  for (const line of headerRaw.split("\n")) {
    const m = line.match(/^([A-Za-z ]+):\s?(.*)$/);
    if (m) meta[m[1].trim()] = m[2].trim();
    else if (!title) title = line.trim();
  }
  const turns: Turn[] = [];
  for (const chunk of parts) {
    const m = chunk.match(/^([^:\n]{1,60}):\s([\s\S]*)$/);
    if (m) turns.push({ speaker: m[1].trim(), text: m[2].trim() });
    else if (chunk.trim()) turns.push({ speaker: "", text: chunk.trim() });
  }
  const dateStr = meta["Date"] ?? "";
  const ts = Date.parse(dateStr);
  return { file, meta, title, headerRaw, turns, ts: Number.isNaN(ts) ? 0 : ts };
}

export function readTranscripts(): Transcript[] {
  const dir = path.join(FIXTURE_DIR, "transcripts");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch { return []; }
  const ts = files.map((f) => parseTranscript(f, fs.readFileSync(path.join(dir, f), "utf8")));
  ts.sort((a, b) => b.ts - a.ts);
  return ts;
}
