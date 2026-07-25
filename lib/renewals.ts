// Server-only: load the Renewals source for the /sources page.
//
// Tries the live Google Sheet first; if anything goes wrong (auth expired,
// network down, missing credentials, API error) it falls back to the local
// renewals_tracker.csv and flags the result as cached so the UI can say so.
import fs from "node:fs";
import path from "node:path";
import { readCsvFile, type CsvTable } from "./fixture";
import { fetchLiveRenewals } from "./googleSheet";

export type RenewalsSource = {
  table: CsvTable;
  /** ISO-8601 last-modified time (sheet's Drive metadata, or CSV file mtime). */
  lastModified: string | null;
  /** "live" = read from Google; "cache" = fell back to the local CSV. */
  source: "live" | "cache";
  /** Present only on fallback: the reason the live read failed (for debugging). */
  note?: string;
};

const CACHE_CSV = "renewals_tracker.csv";

export async function loadRenewals(): Promise<RenewalsSource> {
  try {
    const { table, lastModified } = await fetchLiveRenewals();
    return { table, lastModified, source: "live" };
  } catch (err) {
    console.error("Live renewals fetch failed; serving cached CSV instead:", err);
    const table = readCsvFile(CACHE_CSV);
    let lastModified: string | null = null;
    try {
      const stat = fs.statSync(path.join(process.cwd(), "fixture", CACHE_CSV));
      lastModified = stat.mtime.toISOString();
    } catch {
      /* leave null if the file can't be stat'd */
    }
    return {
      table,
      lastModified,
      source: "cache",
      note: err instanceof Error ? err.message : String(err),
    };
  }
}
