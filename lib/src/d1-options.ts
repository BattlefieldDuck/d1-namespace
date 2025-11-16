export interface D1NamespaceOptions {
    /**
     * Logical namespace that groups key–value pairs.
     * Keys are scoped by this value and are unique within a namespace.
     *
     * Defaults to "" if omitted.
     */
    namespace?: string;

    /**
     * Automatically ensures that the required KV table exists.
     * When enabled, the first operation will create the `kv` table and indexes
     * if they are missing in the bound D1 database.
     *
     * Defaults to `false`.
     */
    ensureSchema?: boolean;

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
