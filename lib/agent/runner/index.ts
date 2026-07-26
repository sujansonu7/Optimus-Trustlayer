// Server-only: pick the compute Runner for this environment.
//
// This is the single place that decides WHICH sandbox backs execute_python.
// Today it's E2B, keyed by E2B_API_KEY. To swap in a different sandbox, add its
// Runner here and return it — nothing else in the app changes, because the whole
// app depends only on the Runner interface (see runner/types.ts).
import type { Runner } from "./types";
import { E2BRunner } from "./e2b";

export type { Runner, RunResult, RunnerArtifact, RunnerFile, RunOptions } from "./types";

/**
 * Return the configured Runner, or null when no sandbox is configured. Callers
 * degrade gracefully (the tool reports "compute is unavailable") rather than
 * crash a run — the rest of TrustLayer keeps working without the compute layer.
 */
export function getRunner(): Runner | null {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) return null;
  return new E2BRunner(apiKey);
}

/** True when a sandbox is configured — used to advertise the tool honestly. */
export function computeAvailable(): boolean {
  return Boolean(process.env.E2B_API_KEY);
}
