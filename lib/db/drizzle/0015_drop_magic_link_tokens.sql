-- DB2/dead-schema: drop the unused magic_link_tokens table. Auth is
-- Google-OAuth-only; this table has zero code references (no reads/writes),
-- so it was pure attack surface (raw token stored + indexed). Drop rather than
-- retrofit hashing on a table nothing uses.

DROP TABLE IF EXISTS "magic_link_tokens";
