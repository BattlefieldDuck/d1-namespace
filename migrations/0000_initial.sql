-- Migration number: 0000 	 2025-11-14T15:05:23.955Z
-- KV on Cloudflare D1 (SQLite)

-- Core table
CREATE TABLE IF NOT EXISTS kv (
  namespace   TEXT    NOT NULL,
  key         TEXT    NOT NULL COLLATE BINARY,
  value       BLOB    NOT NULL,                 -- raw bytes
  ttl_seconds INTEGER,                          -- NULL => never expires
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER GENERATED ALWAYS AS (     -- computed once on write
    CASE WHEN ttl_seconds IS NULL THEN NULL
         ELSE created_at + ttl_seconds
    END
  ) STORED,
  metadata    BLOB,                             -- JSON (stored as text or bytes)
  PRIMARY KEY (namespace, key)
) WITHOUT ROWID;

-- Pruning / expiry scans
CREATE INDEX IF NOT EXISTS kv_ns_exp_idx
  ON kv(namespace, expires_at)
  WHERE expires_at IS NOT NULL;
-- Migration ends here
