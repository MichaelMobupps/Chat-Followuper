/**
 * Postgres error helpers (audit2 D1/C2/A3/A4).
 *
 * Since migration 0013 added partial-unique identity indexes
 * (prospects_user_{telegram,teams,slack,apollo_person}_unique) plus the
 * pre-existing prospects_user_phone_unique, a duplicate insert/update on any of
 * them raises SQLSTATE 23505. The pre-check SELECTs in the ingest routes only
 * arbitrate on (user_id, phone), so a concurrent duplicate handle/apolloPersonId
 * — or a PATCH that collides — used to escape as an opaque 500 (terminal
 * handler) or, in bulk ingest, as `insert_failed` with the raw driver message
 * (constraint name / SQL text) shipped to and rendered by the client.
 *
 * These helpers turn a 23505 into a stable, non-leaky client code.
 */

const PG_UNIQUE_VIOLATION = "23505";

interface PgLikeError {
  code?: unknown;
  constraint?: unknown;
}

/** True for a node-postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as PgLikeError).code === PG_UNIQUE_VIOLATION
  );
}

/** Known unique constraints → stable client error codes. */
const UNIQUE_CONSTRAINT_CODES: Record<string, string> = {
  prospects_user_phone_unique: "duplicate_phone",
  prospects_user_telegram_unique: "duplicate_telegram_handle",
  prospects_user_apollo_person_unique: "duplicate_apollo_person",
};

/**
 * If `err` is a unique violation, return a stable client error code
 * (constraint-specific when known, else generic `duplicate`); otherwise null.
 * Never returns raw driver text.
 */
export function uniqueViolationCode(err: unknown): string | null {
  if (!isUniqueViolation(err)) return null;
  const constraint = (err as PgLikeError).constraint;
  if (typeof constraint === "string" && constraint in UNIQUE_CONSTRAINT_CODES) {
    return UNIQUE_CONSTRAINT_CODES[constraint]!;
  }
  return "duplicate";
}
