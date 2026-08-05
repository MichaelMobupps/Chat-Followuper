/**
 * Vitest global setup (audit finding DB1).
 *
 * The DB helper tests exercise a live Postgres via `DATABASE_URL`. Before the
 * audit there was no migrate step, so the suite failed the moment the target DB
 * lagged the schema (e.g. `.returning()` selecting `pushover_user_key` before
 * migration 0008 was applied). Running the migrator here makes the suite
 * self-healing: it brings whatever DB `DATABASE_URL` points at up to head before
 * any test runs. Migrations are additive + idempotent (`ADD COLUMN IF NOT
 * EXISTS` / `CREATE INDEX IF NOT EXISTS`), so this is safe to run every time.
 *
 * If `DATABASE_URL` is unset we skip (the individual tests will surface their
 * own connection error) rather than throwing an opaque setup failure.
 */
import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[test:globalSetup] DATABASE_URL not set — skipping migrations",
    );
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, "../../drizzle");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("[test:globalSetup] migrations applied (DB at head)");
  } finally {
    await pool.end();
  }
}
