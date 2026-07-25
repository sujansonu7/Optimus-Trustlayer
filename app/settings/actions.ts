"use server";

import { revalidatePath } from "next/cache";
import {
  addDeclaration,
  supersedeDeclaration,
  updateFreshness,
  type DeclarationStatus,
  type StalenessTier,
  type VolatilityClass,
} from "@/lib/settings";

const DECLARATION_STATUSES: DeclarationStatus[] = [
  "proposed",
  "ratified",
  "rejected",
  "superseded",
];
const VOLATILITY: VolatilityClass[] = ["live", "days", "months", "stable"];
const STALENESS: StalenessTier[] = ["critical", "high", "low"];

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function nullable(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

/** Save an edit to an existing declaration (supersedes the old version). */
export async function saveDeclaration(form: FormData): Promise<void> {
  const id = str(form, "id");
  const statement = str(form, "statement");
  const status = str(form, "status") as DeclarationStatus;

  if (!id) throw new Error("Missing declaration id.");
  if (!statement) throw new Error("A declaration needs a statement.");
  if (!DECLARATION_STATUSES.includes(status)) throw new Error("Invalid status.");

  await supersedeDeclaration(id, {
    statement,
    scope: nullable(form, "scope"),
    author: nullable(form, "author"),
    evidence_link: nullable(form, "evidence_link"),
    status,
  });
  revalidatePath("/settings");
}

/** Add a new proposed declaration. */
export async function createDeclaration(form: FormData): Promise<void> {
  const statement = str(form, "statement");
  if (!statement) throw new Error("A declaration needs a statement.");

  await addDeclaration({
    statement,
    scope: nullable(form, "scope"),
    author: nullable(form, "author"),
    evidence_link: nullable(form, "evidence_link"),
  });
  revalidatePath("/settings");
}

/** Save an edit to a freshness policy row (in place). */
export async function saveFreshness(form: FormData): Promise<void> {
  const id = str(form, "id");
  const volatility = str(form, "volatility") as VolatilityClass;
  const staleness_tier = str(form, "staleness_tier") as StalenessTier;

  if (!id) throw new Error("Missing freshness row id.");
  if (!VOLATILITY.includes(volatility)) throw new Error("Invalid volatility class.");
  if (!STALENESS.includes(staleness_tier)) throw new Error("Invalid staleness tier.");

  await updateFreshness(id, {
    volatility,
    staleness_tier,
    notes: nullable(form, "notes"),
  });
  revalidatePath("/settings");
}
