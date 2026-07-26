// Server-safe pure helpers for conflict detection.
//
// The whole point of this file is to make DISAGREEMENTS obvious and JUNK
// invisible. Two kinds of normalization live here:
//
//   1. Attribute canonicalization — the CSV importer and the LLM extractor
//      spell the same idea many ways ("owner"/"account_owner",
//      "arr_usd"/"recurring_subscription_arr"). We fold those onto one
//      canonical attribute so facts about the same thing land in the same bucket.
//
//   2. Value canonicalization — "$410K" and "410000" are the same number;
//      "June 30, 2026" and "2026-06-30" are the same day; "Inc." and "Inc"
//      are the same company. If two values canonicalize equal, there is NO
//      conflict, no matter how differently they were typed. This is what keeps
//      the false-positive bait (Ironwood Co. vs Ironwood Co) from ever firing.
//
// A value that CANNOT be canonicalized into an attribute's value space (a call
// note like "end of the month" for a date, or "at-risk" for a status) is not a
// comparable claim — we drop it rather than let sentiment masquerade as a
// records conflict. That exclusion is the second half of the zero-junk promise.

export type CanonicalAttribute = "renewal_date" | "arr" | "owner" | "status" | "tier";

/** Raw fact attribute (as stored) -> canonical attribute, or undefined if we
 *  don't do cross-source conflict detection on it. Deliberately narrow:
 *  deal-only fields (deal_amount_usd, close_date, deal_owner) are NOT folded in
 *  — they live only in the CRM deals export and would create within-source
 *  noise, not cross-source conflicts. */
const ATTR_SYNONYMS: Record<string, CanonicalAttribute> = {
  renewal_date: "renewal_date",
  arr_usd: "arr",
  recurring_subscription_arr: "arr",
  owner: "owner",
  account_owner: "owner",
  status: "status",
  tier: "tier",
};

export function canonicalAttribute(raw: string): CanonicalAttribute | undefined {
  return ATTR_SYNONYMS[raw.trim().toLowerCase()];
}

/** Human label for a canonical attribute, for cards and rule sentences. */
export const ATTR_LABEL: Record<CanonicalAttribute, string> = {
  renewal_date: "renewal date",
  arr: "ARR",
  owner: "account owner",
  status: "account status",
  tier: "tier",
};

/* ------------------------------------------------------------------ */
/* Value canonicalization                                             */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Money -> integer dollars. "$410K" -> 410000, "410000" -> 410000,
 *  "~$195K" -> 195000, "$1.2M" -> 1200000. Null if there's no number. */
export function normMoney(v: string): number | null {
  const m = String(v).replace(/[,\s$]/g, "").match(/([\d.]+)\s*([kKmM]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  if (/k/i.test(m[2])) n *= 1_000;
  if (/m/i.test(m[2])) n *= 1_000_000;
  return Math.round(n);
}

/** Date -> "YYYY-MM-DD", ONLY when the value names a specific calendar day.
 *  Parsed by hand (never Date.parse) so time zones can never shift the day.
 *  Partial values ("November", "31st", "end of the month") return null and are
 *  treated as non-comparable, not as a competing date. */
export function normDate(v: string): string | null {
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // "June 30, 2026" / "June 30 2026"
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  return null;
}

/** Status -> a small controlled vocabulary. Free-text sentiment ("at-risk",
 *  "staying with Meridian", "unlikely to continue") is NOT a records status and
 *  returns null, so it can never conflict with a real lifecycle value. */
export function normStatus(v: string): string | null {
  const s = String(v).toLowerCase();
  if (s.includes("churn")) return "churned";
  if (s.startsWith("active")) return "active";
  if (s.includes("prospect")) return "prospect";
  return null;
}

/** Person / free-label -> trimmed lowercase, whitespace collapsed. */
export function normName(v: string): string | null {
  const s = String(v).trim().toLowerCase().replace(/\s+/g, " ");
  return s || null;
}

/** Canonicalize a raw value for a given canonical attribute. Returns null when
 *  the value doesn't belong to that attribute's value space (non-comparable). */
export function normalizeValue(attr: CanonicalAttribute, raw: string): string | null {
  switch (attr) {
    case "arr": {
      const n = normMoney(raw);
      return n === null ? null : String(n);
    }
    case "renewal_date":
      return normDate(raw);
    case "status":
      return normStatus(raw);
    case "owner":
    case "tier":
      return normName(raw);
  }
}

/** Present a canonical value the way a human reads it (used for the winner). */
export function displayValue(attr: CanonicalAttribute, canonical: string): string {
  if (attr === "arr") return `$${Number(canonical).toLocaleString("en-US")}`;
  if (attr === "status") return canonical.charAt(0).toUpperCase() + canonical.slice(1);
  return canonical;
}

/* ------------------------------------------------------------------ */
/* Entity keys + conservative resolution                              */
/* ------------------------------------------------------------------ */

// Legal-form suffixes that carry no identity. Stripping ONLY these folds
// "Ironwood Construction Co." == "Ironwood Construction Co" while keeping
// discriminating words ("Partners", "Systems", "Sciences") that separate the
// near-miss pairs (Beacon Health Partners vs Beacon Healthcare Systems).
const LEGAL_SUFFIX = /^(inc|incorporated|llc|co|company|ltd|limited|corp|corporation)$/i;

function tokens(name: string): string[] {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Normalized identity key for a raw entity name (suffix-stripped token join). */
export function entityKey(name: string): string {
  const t = tokens(name);
  while (t.length > 1 && LEGAL_SUFFIX.test(t[t.length - 1])) t.pop();
  return t.join(" ");
}

/**
 * Anchored entity resolution. The structured sources (CRM + spreadsheet) define
 * the canonical universe of accounts. A short name from email/calls
 * ("Quantum Peak", "Thornbury & Cole") resolves INTO a canonical account only
 * when its tokens are an unambiguous prefix of exactly ONE canonical name.
 *
 * This is deliberately one-directional and conservative:
 *   - It never merges two canonical names with each other, so the near-miss
 *     pairs (which are both canonical) can never be collapsed.
 *   - An ambiguous prefix (matching two canonicals) resolves to nothing and is
 *     left as its own key — no guar­anteed-wrong merge, hence no junk conflict.
 */
export function makeResolver(canonicalKeys: Iterable<string>): (key: string) => string {
  const canon = new Set(canonicalKeys);
  const canonToks = Array.from(canon).map((k) => ({ key: k, toks: k.split(" ") }));
  return (key: string) => {
    if (canon.has(key)) return key;
    const et = key.split(" ");
    const matches = canonToks.filter(
      (c) => c.toks.length > et.length && et.every((tok, i) => c.toks[i] === tok)
    );
    return matches.length === 1 ? matches[0].key : key;
  };
}
