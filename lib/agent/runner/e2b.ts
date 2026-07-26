// Server-only: the E2B implementation of the Runner interface.
//
// E2B (https://e2b.dev) gives us a throwaway, network-isolated Linux sandbox
// with a Jupyter kernel — so the agent's Python runs far away from our process,
// our database, and our secrets. We create a sandbox, write the graph JSON into
// it, run one cell, collect stdout / stderr / the matplotlib figures it drew,
// then kill the sandbox. Nothing about our environment travels in except the
// data files we explicitly hand over.
//
// Free tier: a single E2B_API_KEY is all this needs. One sandbox per run, torn
// down immediately, so concurrent demo runs stay cheap.
import { Sandbox } from "@e2b/code-interpreter";
import type { Runner, RunOptions, RunResult, RunnerArtifact } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;

export class E2BRunner implements Runner {
  readonly name = "E2B";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async run(code: string, opts: RunOptions = {}): Promise<RunResult> {
    const started = Date.now();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Create a fresh sandbox. Its lifetime is bounded so a hung run can't leak.
    const sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs: timeoutMs + 15_000,
    });

    try {
      // Drop the input files (the typed graph export) into the working dir, so
      // the code can `open("graph.json")`. These are the ONLY things that cross
      // the boundary — data we already arbitrated, never a connection string.
      for (const f of opts.files ?? []) {
        await sandbox.files.write(f.path, f.content);
      }

      const execution = await sandbox.runCode(code, {
        language: "python",
        timeoutMs,
        onStdout: (m) => opts.onStdout?.(m.line ?? String(m)),
        onStderr: (m) => opts.onStderr?.(m.line ?? String(m)),
      });

      const artifacts: RunnerArtifact[] = [];
      for (const r of execution.results) {
        if (r.png) artifacts.push({ kind: "image", mime: "image/png", base64: r.png });
        else if (r.jpeg) artifacts.push({ kind: "image", mime: "image/jpeg", base64: r.jpeg });
      }

      const error = execution.error
        ? `${execution.error.name}: ${execution.error.value}\n${execution.error.traceback ?? ""}`.trim()
        : null;

      return {
        ok: !error,
        stdout: execution.logs.stdout.join(""),
        stderr: execution.logs.stderr.join(""),
        error,
        artifacts,
        durationMs: Date.now() - started,
      };
    } finally {
      // Always tear the sandbox down, even on failure — no lingering compute.
      await sandbox.kill().catch(() => {});
    }
  }
}
