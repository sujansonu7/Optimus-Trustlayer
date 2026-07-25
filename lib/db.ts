import { Pool, type QueryResult, type QueryResultRow } from "pg";

// Reuse a single pool across hot-reloads / serverless invocations.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Neon requires TLS. rejectUnauthorized:false avoids cert-chain
      // surprises across environments while still using an encrypted link.
      ssl: { rejectUnauthorized: false },
      // Fail fast rather than hanging the page render if the DB is down.
      connectionTimeoutMillis: 5000,
    });
  }
  return global._pgPool;
}

/**
 * Returns true only if the database is actually reachable and answers a
 * trivial query. Any missing config, network error, or timeout returns false.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  try {
    const client = await getPool().connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Database reachability check failed:", err);
    return false;
  }
}

/**
 * Run a parameterized query against the shared pool. Thin wrapper so callers
 * don't each reach for the pool. Always use $1, $2… placeholders — never string
 * interpolation — so user input can't become SQL.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as never);
}
