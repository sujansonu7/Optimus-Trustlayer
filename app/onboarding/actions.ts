"use server";

import { revalidatePath } from "next/cache";
import {
  verifySheet,
  writeDeclarations,
  proofQuestions,
  type SheetStatus,
  type DeclarationChoice,
  type ProofQuestion,
} from "@/lib/onboarding";
import { materializeDecisions } from "@/lib/decisions";

/** The Renewals Sheet connects for real — hit Google live and report back. */
export async function verifySheetAction(): Promise<SheetStatus> {
  return verifySheet();
}

/** Log every automatic decision the just-finished build produced. Called once
 *  the live build completes, so /decisions is populated. */
export async function materializeAction(): Promise<{ logged: number; total: number }> {
  const r = await materializeDecisions();
  revalidatePath("/decisions");
  return r;
}

/** Write the declaration wizard's choices as real declarations. */
export async function writeDeclarationsAction(
  choices: DeclarationChoice[]
): Promise<{ written: number }> {
  const r = await writeDeclarations(choices);
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/conflicts");
  return r;
}

/** Mine the built graph for 3 verified, answerable proof questions. */
export async function proofQuestionsAction(): Promise<ProofQuestion[]> {
  return proofQuestions();
}
