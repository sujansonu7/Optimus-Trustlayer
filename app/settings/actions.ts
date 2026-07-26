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

/**
 * The result every settings form action returns. Instead of throwing (which
 * renders the raw Next.js error page), an invalid submit comes back as
 * { ok:false, error } and the form renders it inline. useFormState in the client
 * threads this through. `ok:true` with no error means the save succeeded.
 */
export type SettingsFormState = { ok: boolean; error: string | null };

// NOTE: a "use server" file may only export async functions, so the initial
// state constant lives in the client (SettingsClient.tsx), not here.
function fail(error: string): SettingsFormState {
  return { ok: false, error };
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function nullable(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

/** Save an edit to an existing declaration (supersedes the old version). */
export async function saveDeclaration(
  _prev: SettingsFormState,
  form: FormData
): Promise<SettingsFormState> {
  const id = str(form, "id");
  const statement = str(form, "statement");
  const status = str(form, "status") as DeclarationStatus;

  if (!id) return fail("Missing declaration id — reload the page and try again.");
  if (!statement) return fail("A declaration needs a statement.");
  if (!DECLARATION_STATUSES.includes(status)) return fail("Please choose a valid status.");

  try {
    await supersedeDeclaration(id, {
      statement,
      scope: nullable(form, "scope"),
      author: nullable(form, "author"),
      evidence_link: nullable(form, "evidence_link"),
      status,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/settings");
  return { ok: true, error: null };
}

/** Add a new proposed declaration. */
export async function createDeclaration(
  _prev: SettingsFormState,
  form: FormData
): Promise<SettingsFormState> {
  const statement = str(form, "statement");
  if (!statement) return fail("A declaration needs a statement.");

  try {
    await addDeclaration({
      statement,
      scope: nullable(form, "scope"),
      author: nullable(form, "author"),
      evidence_link: nullable(form, "evidence_link"),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/settings");
  return { ok: true, error: null };
}

/** Save an edit to a freshness policy row (in place). */
export async function saveFreshness(
  _prev: SettingsFormState,
  form: FormData
): Promise<SettingsFormState> {
  const id = str(form, "id");
  const volatility = str(form, "volatility") as VolatilityClass;
  const staleness_tier = str(form, "staleness_tier") as StalenessTier;

  if (!id) return fail("Missing freshness row id — reload the page and try again.");
  if (!VOLATILITY.includes(volatility)) return fail("Please choose a valid volatility class.");
  if (!STALENESS.includes(staleness_tier)) return fail("Please choose a valid staleness tier.");

  try {
    await updateFreshness(id, {
      volatility,
      staleness_tier,
      notes: nullable(form, "notes"),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/settings");
  return { ok: true, error: null };
}
