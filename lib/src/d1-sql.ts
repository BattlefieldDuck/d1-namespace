/**
 * Validates that a table name is safe to interpolate into SQL.
 *
 * Allowed characters:
 *   - A–Z
 *   - a–z
 *   - 0–9
 *   - _ (underscore)
 *
 * Disallowed:
 *   - spaces
 *   - punctuation or symbols (.-;:!?@#$% etc.)
 *   - quotes (" ' `)
 *   - SQL injection attempts
 *   - Unicode characters (emoji, CJK, etc.)
 *
 * This ensures the table name can be safely used as a SQL identifier
 * without quoting or escaping.
 */
export function sanitizeTableName(name: string): string {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
        throw new Error(
            `Invalid table name "${name}". ` +
            `Allowed characters: A-Z, a-z, 0-9, and _. ` +
            `No spaces, punctuation, unicode, or special symbols are permitted.`
        );
    }
    return name;
}

export const D1_SQL = {
    get: (table: string) => /* sql */ `
        SELECT value
        FROM ${table}
        WHERE namespace = ?
          AND key = ?
          AND (expires_at IS NULL OR expires_at > unixepoch())
    `,

    getWithMetadata: (table: string) => /* sql */ `
        SELECT value, metadata
        FROM ${table}
        WHERE namespace = ?
          AND key = ?
          AND (expires_at IS NULL OR expires_at > unixepoch())
    `,

    list: (table: string) => /* sql */ `
        SELECT key, expires_at, metadata
        FROM ${table}
        WHERE namespace = ?
          AND (expires_at IS NULL OR expires_at > unixepoch())
          AND key >= ?
          AND key < ?
          AND key > ?
        ORDER BY key COLLATE BINARY
        LIMIT ?
    `,

    put: (table: string) => /* sql */ `
        INSERT INTO ${table} (namespace, key, value, ttl_seconds, created_at, metadata)
        VALUES (?, ?, ?, ?, unixepoch(), ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
            value       = excluded.value,
            ttl_seconds = excluded.ttl_seconds,
            created_at  = unixepoch(),
            metadata    = excluded.metadata
    `,

    delete: (table: string) => /* sql */ `
        DELETE FROM ${table}
        WHERE namespace = ?
          AND key = ?
    `,

    ensureTable: (table: string) => /* sql */ `
        CREATE TABLE IF NOT EXISTS ${table} (
            namespace   TEXT    NOT NULL,
            key         TEXT    NOT NULL COLLATE BINARY,
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
        ) WITHOUT ROWID;

        CREATE INDEX IF NOT EXISTS ${table}_ns_exp_idx
            ON ${table}(namespace, expires_at)
            WHERE expires_at IS NOT NULL;
    `,

    pruneExpired: (table: string) => /* sql */ `
        DELETE FROM ${table}
        WHERE namespace = ?
          AND expires_at IS NOT NULL
          AND expires_at <= unixepoch()
    `,
} as const;
