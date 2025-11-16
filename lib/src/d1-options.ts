export interface D1NamespaceOptions {
    /**
     * Logical namespace that groups key–value pairs.
     * Keys are scoped by this value and are unique within a namespace.
     *
     * Defaults to "" if omitted.
     */
    namespace?: string;

    /**
     * Configuration for the underlying D1 table used to store KV entries.
     *
     * By default, all data is stored in a table named "kv". You can override
     * the table name to isolate multiple logical stores inside the same D1
     * database (e.g. "auth_kv", "cache_kv", "sessions_kv").
     *
     * All custom tables must follow the same schema as the default table.
     */
    table?: {
        /**
         * Name of the D1 table where key–value records are stored.
         *
         * Defaults to "kv".
         *
         * Notes:
         * - Useful when sharing one D1 database across multiple logical stores.
         * - Each table is still internally partitioned by `namespace`, so both
         *   features can be combined to isolate data as needed.
         */
        name?: string;

        /**
         * Whether the table (and its supporting indexes) should be created
         * automatically if they do not already exist.
         *
         * When enabled, the first operation runs a lightweight schema check
         * and executes `CREATE TABLE IF NOT EXISTS` and index creation
         * statements for the configured table name.
         *
         * Defaults to true.
         *
         * Notes:
         * - Recommended for development and serverless deployments where the
         *   database may start empty.
         * - Disable this if you handle schema creation externally (e.g. via
         *   migrations or Drizzle).
         */
        autoCreate?: boolean;
    };

    /**
     * Automatically prune expired keys after specific operations.
     *
     * Supported operations:
     *   - "put"             → prune after inserting/updating a key
     *   - "delete"          → prune after deleting a key
     *   - "get"             → prune after reading a key (not recommended; adds write overhead)
     *   - "getWithMetadata" → prune after reading with metadata (also not recommended)
     *   - "list"            → prune after listing keys (use with caution; may degrade list performance)
     *
     * Default: ["put", "delete"]
     *
     * Notes:
     * - Pruning on read-based operations ("get", "getWithMetadata", "list") is generally discouraged
     *   because it introduces write operations during reads, which can impact performance and latency.
     * - The safest and most KV-like behavior is the default: prune only on writes and deletes.
     */
    pruneExpiredKeysOn?: ("put" | "delete" | "get" | "getWithMetadata" | "list")[];
}
