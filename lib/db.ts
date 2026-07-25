import { Pool } from "pg";

// Reuse a single pool across hot-reloads / serverless invocations.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function getPool(): Pool {
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
