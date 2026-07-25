// Server-only: read the live Renewals sheet from Google.
//
// Auth model: a Google **service account**. The sheet is shared (Viewer) with
// the service account's email, so no interactive login / token refresh is ever
// needed — we sign a short-lived JWT and call the Sheets + Drive REST APIs.
// See .env.example for the required variables and the setup steps.
import { JWT } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";
import type { CsvTable } from "./fixture";

// The spreadsheet that backs the Renewals tab. Defaults to the sheet the owner
// provided; overridable via env so the source can change without code edits.
const SHEET_ID =
  process.env.RENEWALS_SHEET_ID || "1lGaWwfYfjemZo6idsY9_qKEIY-EivTWRmNkNRDAlCUc";

// Read-only scopes: cell values (Sheets) + file metadata for last-modified (Drive).
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

type ServiceAccount = { client_email: string; private_key: string };

// Credentials come from EITHER an inline JSON env var (handy for Vercel) OR a
// git-ignored key file on disk (handy locally). File path defaults to
// ./google-service-account.json in the project root.
function loadServiceAccount(): ServiceAccount {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) {
    const j = JSON.parse(inline);
    if (!j.client_email || !j.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key");
    }
    return { client_email: j.client_email, private_key: j.private_key };
  }

  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "google-service-account.json";
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const raw = fs.readFileSync(abs, "utf8"); // throws if missing -> caller falls back to cache
  const j = JSON.parse(raw);
  if (!j.client_email || !j.private_key) {
    throw new Error(`Service account key file ${file} is missing client_email/private_key`);
  }
  return { client_email: j.client_email, private_key: j.private_key };
}

async function getAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: SCOPES });
  const { access_token } = await jwt.authorize();
  if (!access_token) throw new Error("Google returned no access token");
  return access_token;
}

export type LiveRenewals = {
  table: CsvTable;
  /** ISO-8601 last-modified time of the spreadsheet, from Drive metadata. */
  lastModified: string | null;
};

/**
 * Fetch the first sheet's cell values (formatted, as displayed) plus the
 * spreadsheet's real last-modified timestamp. Throws on any auth/network/API
 * failure so the caller can fall back to the cached CSV.
 */
export async function fetchLiveRenewals(): Promise<LiveRenewals> {
  const token = await getAccessToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  // Columns A:Z of the first (default) sheet is plenty for the 11-column tracker.
  const valuesUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("A:Z")}`;
  // Drive metadata gives the authoritative modifiedTime (not a hardcoded value).
  const metaUrl =
    `https://www.googleapis.com/drive/v3/files/${SHEET_ID}?fields=modifiedTime&supportsAllDrives=true`;

  const [valuesRes, metaRes] = await Promise.all([
    fetch(valuesUrl, { headers: authHeader, cache: "no-store" }),
    fetch(metaUrl, { headers: authHeader, cache: "no-store" }),
  ]);

  if (!valuesRes.ok) {
    throw new Error(`Sheets API ${valuesRes.status}: ${(await valuesRes.text()).slice(0, 300)}`);
  }
  if (!metaRes.ok) {
    throw new Error(`Drive API ${metaRes.status}: ${(await metaRes.text()).slice(0, 300)}`);
  }

  const valuesJson = (await valuesRes.json()) as { values?: string[][] };
  const metaJson = (await metaRes.json()) as { modifiedTime?: string };

  const values = valuesJson.values ?? [];
  const headers = values.shift() ?? [];
  // The values API trims trailing empty cells, so pad short rows to header width
  // to keep the grid rectangular.
  const rows = values.map((r) => {
    const cells = [...r];
    while (cells.length < headers.length) cells.push("");
    return cells;
  });

  return { table: { headers, rows }, lastModified: metaJson.modifiedTime ?? null };
}
