// The grading oracle for the conflict-yield counter on /admin.
//
// IMPORTANT: the application must NEVER read fixture/planted_conflicts.md at
// runtime (it is the answer key — see the warning at the top of that file).
// This file is a HUMAN transcription of the *value-conflict* subset of that
// answer key, checked in as a test oracle so /admin can self-grade detection.
// It is data a developer typed, not a file the app opens.
//
// planted_conflicts.md contains several KINDS of planted problem. This detector
// owns exactly one kind: the same attribute given DIFFERENT values by DIFFERENT
// sources. Those are the four rows below (answer-key sections #3, #5a, #5b, #5c).
//
// The remaining planted items are other capabilities' jobs and are intentionally
// NOT in this oracle:
//   #1  Silverline four-names ............ entity resolution (one entity, many names)
//   #2  near-miss pairs (must stay split). entity resolution (must NOT merge)
//   #4  Prairie Point buried discount .... exception detection (an omission, not a
//                                          cross-source value disagreement)
//   #5d Beacon "Liz"/"Elizabeth" Munro ... person resolution (same person)
//   #6  product / module naming drift .... entity resolution (non-person entities)
//   #8  Ironwood/Cedar Vale/Kingfisher ... false-positive bait — must produce NO
//                                          conflict (verified by junk == 0)
//
// Match key is (normalized entity key, canonical attribute). `winner` and
// `loser` are canonical (normalized) values so the check is format-independent.

import { entityKey, type CanonicalAttribute } from "./normalize";

export type ExpectedConflict = {
  /** Answer-key section this row grades. */
  planted: string;
  /** Canonical entity key (suffix-stripped, lowercased). */
  entity: string;
  /** Human account name, for display. */
  entityLabel: string;
  attribute: CanonicalAttribute;
  /** Canonical value that arbitration should pick. */
  winner: string;
  /** Canonical value(s) that should lose (but still be shown, never hidden). */
  losers: string[];
};

export const EXPECTED_CONFLICTS: ExpectedConflict[] = [
  {
    planted: "#3 Cobalt Ridge renewal date",
    entity: entityKey("Cobalt Ridge Manufacturing"),
    entityLabel: "Cobalt Ridge Manufacturing",
    attribute: "renewal_date",
    winner: "2026-06-30", // Renewals Sheet (declared, ratified SoR)
    losers: ["2026-09-30"], // stale CRM term
  },
  {
    planted: "#5a Quantum Peak ARR (board deck vs finance)",
    entity: entityKey("Quantum Peak Insurance"),
    entityLabel: "Quantum Peak Insurance",
    attribute: "arr",
    winner: "365000", // recurring ARR — CRM + sheet + call agree
    losers: ["410000"], // board-deck figure bundling a one-time PS add-on
  },
  {
    planted: "#5b Thornbury & Cole account owner",
    entity: entityKey("Thornbury & Cole Insurance Group"),
    entityLabel: "Thornbury & Cole Insurance Group",
    attribute: "owner",
    winner: "sara lindqvist", // sheet + handoff email agree
    losers: ["jordan ellis"], // stale CRM field (Jordan departed Oct 2025)
  },
  {
    planted: "#5c Grantline Media churned-but-Active",
    entity: entityKey("Grantline Media Group"),
    entityLabel: "Grantline Media Group",
    attribute: "status",
    winner: "churned", // sheet + customer email agree
    losers: ["active"], // stale CRM lifecycle
  },
];

/** Look up the expected result for a detected (entity, attribute) pair. */
export function expectedFor(
  entity: string,
  attribute: CanonicalAttribute
): ExpectedConflict | undefined {
  return EXPECTED_CONFLICTS.find((e) => e.entity === entity && e.attribute === attribute);
}
