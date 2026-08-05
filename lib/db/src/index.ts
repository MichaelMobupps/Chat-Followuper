import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * `connectionTimeoutMillis` is set deliberately (2026-07-15 audit).
 *
 * pg's default is 0 = wait FOREVER for a pool slot. With `max: 10` (also the
 * default) that means a saturated pool or a DB failover doesn't surface as an
 * error anyone can handle — every caller just hangs, indefinitely, including
 * ones whose own work already succeeded. An unbounded wait is not resilience;
 * it converts a slow dependency into an unbounded one.
 *
 * 10s, not the 2s the audit suggested: this must not fire on a legitimate
 * burst. With max:10 and sub-second queries, a 10s wait for a CONNECTION (not a
 * query) is already pathological — by then the pool is not coming back on its
 * own, and a fast error that a caller can catch, log, and degrade on beats a
 * hang that looks like a frozen product.
 *
 * Deliberately NOT setting statement_timeout here: that would cap query
 * execution across every existing query in the app, and some (the admin CSV
 * export is unbounded by design, the bench's rollups) legitimately run long.
 * Bounding the WAIT is the fix for the hazard found; bounding EXECUTION is a
 * separate change with its own blast radius and should be measured first.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./actionLog";
