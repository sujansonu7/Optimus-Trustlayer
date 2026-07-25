// scripts/migrate.mjs
//
// Boring, dependency-free migration runner. Applies every *.sql file in
// /migrations, in filename order, exactly once. Each migration runs inside a
// transaction (Postgres DDL is transactional), so a failed migration leaves
// nothing half-applied. Applied migrations are tracked in _migrations.
//
//   npm run db:migrate
//
// Reads DATABASE_URL from the environment or from the local .env file.

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "migrations");

// --- Minimal .env loader (no dotenv dependency) -------------------------
// Only fills variables that are not already set in the real environment.
function loadDotEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, ".env"), "utf8");
  } catch {
    return; // no .env file — rely on the real environment
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Add it to .env (see .env.example) and retry."
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Neon requires TLS
  });
  await client.connect();

  try {
    await client.query(`
      create table if not exists _migrations (
        filename    text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      );
    `);

    const applied = new Map(
      (await client.query("select filename, checksum from _migrations")).rows.map(
        (r) => [r.filename, r.checksum]
      )
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let ran = 0;
    for (const filename of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) {
          console.error(
            `\n✗ ${filename} was already applied but its contents changed.\n` +
              `  Migrations are immutable — add a new migration instead of editing this one.`
          );
          process.exit(1);
        }
        continue; // already applied, unchanged
      }

      process.stdout.write(`→ applying ${filename} ... `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into _migrations (filename, checksum) values ($1, $2)",
          [filename, checksum]
        );
        await client.query("commit");
        console.log("done");
        ran++;
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        throw err;
      }
    }

    console.log(
      ran === 0
        ? "\nAlready up to date — no migrations to apply."
        : `\nApplied ${ran} migration${ran === 1 ? "" : "s"}.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message || err);
  process.exit(1);
});
