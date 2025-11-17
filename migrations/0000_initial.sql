-- Migration number: 0000 	 2025-11-14T15:05:23.955Z
-- KV on Cloudflare D1 (SQLite)

-- Core table
CREATE TABLE IF NOT EXISTS _kv_entries (
  key        TEXT    NOT NULL COLLATE BINARY PRIMARY KEY,
  value      BLOB    NOT NULL,
  expiration INTEGER,
  metadata   BLOB
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS _kv_entries_exp_idx
  ON _kv_entries(expiration);
-- Migration ends here
