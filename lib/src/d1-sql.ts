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
        WHERE key = ?
          AND (expiration IS NULL OR expiration > unixepoch())
    `,

    getWithMetadata: (table: string) => /* sql */ `
        SELECT value, metadata
        FROM ${table}
        WHERE key = ?
          AND (expiration IS NULL OR expiration > unixepoch())
    `,

    list: (table: string) => /* sql */ `
        SELECT key, expiration, metadata
        FROM ${table}
        WHERE (expiration IS NULL OR expiration > unixepoch())
          AND key >= ?
          AND key < ?
          AND key > ?
        ORDER BY key COLLATE BINARY
        LIMIT ?
    `,

    put: (table: string) => /* sql */ `
        INSERT INTO ${table} (key, value, expiration, metadata)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value      = excluded.value,
            expiration = excluded.expiration,
            metadata   = excluded.metadata
    `,

    delete: (table: string) => /* sql */ `
        DELETE FROM ${table}
        WHERE key = ?
    `,

    ensureTable: (table: string) => /* sql */ `
        CREATE TABLE IF NOT EXISTS ${table} (
            key        TEXT    NOT NULL COLLATE BINARY PRIMARY KEY,
            value      BLOB    NOT NULL,
            expiration INTEGER,
            metadata   BLOB
        ) WITHOUT ROWID;

        CREATE INDEX IF NOT EXISTS ${table}_exp_idx
            ON ${table}(expiration);
    `,

    deleteExpired: (table: string) => /* sql */ `
        DELETE FROM ${table}
        WHERE expiration IS NOT NULL
          AND expiration <= unixepoch()
    `,
} as const;
