// Server-only: load the Renewals source for the /sources page.
//
// Two live paths are tried, best first, then the local cache:
//   1. Service account  — private sheet, exact Drive modifiedTime. Needs GCP.
//   2. Published CSV    — a "Publish to web" link. No GCP and no auth, still a
//                         real read from Google, but the link is public and the
//                         timestamp is only as good as the Last-Modified header.
//   3. renewals_tracker.csv — flagged as cached so the UI says so.
// Adding service-account credentials is all it takes to move back up to (1);
// see RENEWALS_LIVE.md.
import fs from "node:fs";
import path from "node:path";
import { readCsvFile, type CsvTable } from "./fixture";
import { fetchLiveRenewals, fetchPublishedRenewals } from "./googleSheet";

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
  const attempts: string[] = [];

  try {
    const { table, lastModified } = await fetchLiveRenewals();
    return { table, lastModified, source: "live" };
  } catch (err) {
    // Expected whenever no service account is configured — not an error yet,
    // since the published-CSV path below may still give a live read.
    attempts.push(`service account: ${err instanceof Error ? err.message : String(err)}`);
  }

  const publishedUrl = process.env.RENEWALS_SHEET_CSV_URL?.trim();
  if (publishedUrl) {
    try {
      const { table, lastModified } = await fetchPublishedRenewals(publishedUrl);
      return { table, lastModified, source: "live" };
    } catch (err) {
      attempts.push(`published CSV: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    attempts.push("published CSV: RENEWALS_SHEET_CSV_URL not set");
  }

  console.error("No live renewals path succeeded; serving cached CSV instead:", attempts);
  const table = readCsvFile(CACHE_CSV);
  let lastModified: string | null = null;
  try {
    const stat = fs.statSync(path.join(process.cwd(), "fixture", CACHE_CSV));
    lastModified = stat.mtime.toISOString();
  } catch {
    /* leave null if the file can't be stat'd */
  }
  // Every failed path, so the reason is visible instead of guessed at.
  return { table, lastModified, source: "cache", note: attempts.join(" | ") };
}
