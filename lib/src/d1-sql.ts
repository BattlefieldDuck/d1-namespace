export const D1_SQL = {
    get: /* sql */ `
        SELECT value
        FROM kv
        WHERE namespace = ?
        AND key = ?
        AND (expires_at IS NULL OR expires_at > unixepoch())
    `,
    getWithMetadata: /* sql */ `
        SELECT value, metadata
        FROM kv
        WHERE namespace = ?
            AND key = ?
            AND (expires_at IS NULL OR expires_at > unixepoch())
    `,
    list: /* sql */ `
        SELECT key, expires_at, metadata
        FROM kv
        WHERE namespace = ?
            AND (expires_at IS NULL OR expires_at > unixepoch())
            AND key >= ?
            AND key < ?
            AND key > ?
        ORDER BY key COLLATE BINARY
        LIMIT ?
    `,
    put: /* sql */ `
        INSERT INTO kv (namespace, key, value, ttl_seconds, created_at, metadata)
            VALUES (?, ?, ?, ?, unixepoch(), ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
            value       = excluded.value,
            ttl_seconds = excluded.ttl_seconds,
            created_at  = unixepoch(),
            metadata    = excluded.metadata
    `,
    delete: /* sql */ `
        DELETE FROM kv WHERE namespace = ? AND key = ?
    `,
    ensureSchema: /* sql */ `
        CREATE TABLE IF NOT EXISTS kv (
            namespace   TEXT    NOT NULL,
            key         TEXT    NOT NULL,
            value       BLOB    NOT NULL,
            ttl_seconds INTEGER,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            expires_at  INTEGER GENERATED ALWAYS AS (
                CASE WHEN ttl_seconds IS NULL THEN NULL
                     ELSE created_at + ttl_seconds
                END
            ) STORED,
            metadata    BLOB,
            PRIMARY KEY (namespace, key)
        );

        CREATE INDEX IF NOT EXISTS kv_ns_key_bin_idx
            ON kv(namespace, key COLLATE BINARY);

        CREATE INDEX IF NOT EXISTS kv_ns_exp_idx
            ON kv(namespace, expires_at)
            WHERE expires_at IS NOT NULL;
    `,
    pruneExpired: /* sql */ `
        DELETE FROM kv
            WHERE namespace = ?
                AND expires_at IS NOT NULL
                AND expires_at <= unixepoch()
    `,
} as const;
