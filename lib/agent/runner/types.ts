// The Runner interface — the seam that makes compute swappable.
//
// The agent writes Python; a Runner takes that code plus a set of input files
// (a typed JSON export of the graph — never DB credentials) and runs it in an
// ISOLATED sandbox. TrustLayer only ever hands the sandbox DATA it already
// arbitrated, so the sandbox can compute over the numbers but can never reach
// the database, the network secrets, or anything else.
//
// E2B is the first implementation (see e2b.ts). Because everything upstream —
// the execute_python tool, the work product, the UI — depends only on this
// interface, swapping E2B for another sandbox (or a local one) is a one-file
// change: implement Runner and return it from getRunner().

/** One file written into the sandbox before the code runs (e.g. graph.json). */
export type RunnerFile = {
  /** Path relative to the sandbox working directory, e.g. "graph.json". */
  path: string;
  /** UTF-8 contents. */
  content: string;
};

/** A rich output the code produced — a chart image or an emitted file. */
export type RunnerArtifact = {
  kind: "image";
  /** MIME type, e.g. "image/png". */
  mime: string;
  /** Base64-encoded bytes (no data: prefix). */
  base64: string;
};

/** The outcome of one code run. Never throws for a *code* error — a Python
 *  exception comes back as `error` with ok=false so the agent can react. */
export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** A Python-level error (traceback), or null when the code ran clean. */
  error: string | null;
  /** Charts / images the code produced (matplotlib figures, PIL images, …). */
  artifacts: RunnerArtifact[];
  /** How long the run took, in ms — surfaced in the visible step. */
  durationMs: number;
};

export type RunOptions = {
  /** Files to drop into the sandbox before running (the graph JSON export). */
  files?: RunnerFile[];
  /** Hard cap on code execution time. */
  timeoutMs?: number;
  /** Streamed stdout lines, so the run is watchable as it happens. */
  onStdout?: (chunk: string) => void;
  /** Streamed stderr lines. */
  onStderr?: (chunk: string) => void;
};

/**
 * A swappable code sandbox. One implementation = one place code can run.
 */
export interface Runner {
  /** Human name for the seam (shown in the visible step, e.g. "E2B"). */
  readonly name: string;
  /** Run Python (the only language the agent writes) and return its outputs. */
  run(code: string, opts?: RunOptions): Promise<RunResult>;
}
