import { D1NamespaceOptions } from "./d1-options";
import { D1_SQL, sanitizeTableName } from "./d1-sql";
import { base64Decode, base64Encode, readStream } from "./utils";

export class D1Namespace<Key extends string = string> implements KVNamespace<Key> {
    /**
     * The final, normalized configuration used by this instance.
     */
    readonly options: Readonly<Required<D1NamespaceOptions>>;

    /**
     * Internal UTF-8 encoders/decoders used for converting between
     * string values and the underlying D1 BLOB storage format.
     */
    readonly #encoder = new TextEncoder();
    readonly #decoder = new TextDecoder();

    /**
     * Cached, lazily-prepared SQL statements.
     * Each statement is prepared once per instance and reused across calls,
     * avoiding repeated SQL parsing inside D1 and improving performance.
     */
    readonly #stmt: {
        get: D1PreparedStatement,
        getWithMetadata: D1PreparedStatement,
        list: D1PreparedStatement,
        put: D1PreparedStatement,
        delete: D1PreparedStatement,
        ensureTable: D1PreparedStatement,
        pruneExpired: D1PreparedStatement,
    };

    /**
     * Promise that resolves once the namespace table exists.
     * Used to ensure `ensureTable()` is run once and awaited by
     * concurrent calls without duplicating schema creation.
     */
    #tableReady?: Promise<void>;

    constructor(
        private readonly d1: D1Database,
        options?: D1NamespaceOptions
    ) {
        const tableName = options?.table?.name ? sanitizeTableName(options.table.name) : "kv";
        const pruneExpiredKeysOn = options?.pruneExpiredKeysOn ?? ["put", "delete"];

        this.options = Object.freeze({
            namespace: options?.namespace ?? "",
            table: {
                name: tableName,
                autoCreate: options?.table?.autoCreate ?? true,
            },
            pruneExpiredKeysOn,
        });

        this.#stmt = {
            get: this.d1.prepare(D1_SQL.get(tableName)),
            getWithMetadata: this.d1.prepare(D1_SQL.getWithMetadata(tableName)),
            list: this.d1.prepare(D1_SQL.list(tableName)),
            put: this.d1.prepare(D1_SQL.put(tableName)),
            delete: this.d1.prepare(D1_SQL.delete(tableName)),
            ensureTable: this.d1.prepare(D1_SQL.ensureTable(tableName)),
            pruneExpired: this.d1.prepare(D1_SQL.pruneExpired(tableName)),
        };
    }

    async get<ExpectedValue = unknown>(
        key: Key | Array<Key>,
        options?: any
    ): Promise<any> {
        await this.#ensureTable();

        const type = (typeof options === "string" ? options : options?.type) ?? "text";
        const value = await this.#getImpl<ExpectedValue>(key, type, false);

        if (this.options.pruneExpiredKeysOn?.includes("get")) {
            await this.pruneExpired();
        }

        return value;
    }

    async getWithMetadata<ExpectedValue = unknown>(
        key: Key | Array<Key>,
        options?: any
    ): Promise<any> {
        await this.#ensureTable();

        const type = (typeof options === "string" ? options : options?.type) ?? "text";
        const value = await this.#getImpl<ExpectedValue>(key, type, true);

        if (this.options.pruneExpiredKeysOn?.includes("getWithMetadata")) {
            await this.pruneExpired();
        }

        return value;
    }

    async list<Metadata = unknown>(
        options?: KVNamespaceListOptions
    ): Promise<KVNamespaceListResult<Metadata, Key>> {
        // https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/shared/keyvalue.worker.ts#L233
        const prefix = options?.prefix ?? "";
        const lower = prefix;                      // inclusive
        const upper = prefix + "\u{10FFFF}";       // exclusive
        const limit = Math.max(1, Number(options?.limit ?? 1000));

        // decode cursor
        const start_after = options?.cursor ? base64Decode(options.cursor) : "";

        const rows = await this.#stmt.list
            .bind(this.options.namespace, lower, upper, start_after, limit + 1)
            .all<{ key: string; expires_at: number | null; metadata: ArrayBuffer }>();

        const hasMore = rows.results.length > limit;
        const page = hasMore ? rows.results.slice(0, limit) : rows.results;

        // Build KV-style items: { name, expiration?, metadata? }
        const keys = page.map(r => {
            const item: { name: Key; expiration?: number; metadata?: Metadata } = { name: r.key as Key };
            if (typeof r.expires_at === "number") item.expiration = r.expires_at;
            if (r.metadata) item.metadata = JSON.parse(this.#decoder.decode(new Uint8Array(r.metadata)));
            return item;
        });

        if (this.options.pruneExpiredKeysOn?.includes("list")) {
            await this.pruneExpired();
        }

        if (hasMore) {
            const lastKey = page[page.length - 1]!.key;
            const nextCursor = base64Encode(lastKey);
            return { keys, list_complete: false, cursor: nextCursor, cacheStatus: null };
        }

        return { keys, list_complete: true, cacheStatus: null };
    }

    async put(
        key: Key,
        value: any,
        options?: KVNamespacePutOptions
    ): Promise<void> {
        await this.#ensureTable();

        // 1) Normalize value to Uint8Array
        let bytes: Uint8Array;
        if (typeof value === "string") {
            bytes = this.#encoder.encode(value);
        } else if (value instanceof ArrayBuffer) {
            bytes = new Uint8Array(value);
        } else if (ArrayBuffer.isView(value)) {
            bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        } else if (value instanceof ReadableStream) {
            bytes = await readStream(value);
        } else {
            throw new TypeError("KV put() accepts only strings, ArrayBuffers, ArrayBufferViews, and ReadableStreams as values.");
        }

        // 2) Compute expiration TTL seconds
        // https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/kv/validator.worker.ts#L73
        let expiration: number | null = null;

        if (options?.expirationTtl != null) {
            expiration = options.expirationTtl;

            if (expiration <= 0) {
                throw new RangeError(`Invalid expiration_ttl of ${options.expirationTtl}. Please specify integer greater than 0.`);
            }
        } else if (options?.expiration != null) {
            expiration = options.expiration - Math.floor(Date.now() / 1000);

            if (expiration <= 0) {
                throw new RangeError(`Invalid expiration of ${options.expiration}. Please specify integer greater than the current number of seconds since the UNIX epoch.`);
            }
        }

        // 3) Serialize metadata as JSON (nullable)
        let metadata: Uint8Array<ArrayBufferLike> | null;
        if (options?.metadata === undefined) {
            metadata = null;
        } else {
            const metadataString = JSON.stringify(options.metadata);

            if (metadataString === undefined) {
                throw new TypeError("Metadata could not be serialized to JSON.");
            }

            metadata = this.#encoder.encode(metadataString);
        }

        // 4) UPSERT
        await this.#stmt.put.bind(this.options.namespace, key, bytes, expiration, metadata).run();

        if (this.options.pruneExpiredKeysOn?.includes("put")) {
            await this.pruneExpired();
        }
    }

    async delete(key: Key): Promise<void> {
        await this.#ensureTable();

        await this.#stmt.delete.bind(this.options.namespace, key).run();

        if (this.options.pruneExpiredKeysOn?.includes("delete")) {
            await this.pruneExpired();
        }
    }

    /**
     * Removes all expired key–value pairs within this namespace.
     *
     * Cloudflare KV automatically evicts expired keys in the background,
     * but D1 does not. This method provides an explicit cleanup step to
     * maintain parity with KV’s behavior when TTLs are used.
     *
     * Behavior:
     * - Only keys whose `expires_at` timestamp is in the past are removed.
     * - Only keys inside *this namespace* are affected.
     * - Returns the number of rows deleted.
     *
     * This method is safe to call repeatedly; if there are no expired
     * entries, it simply returns `0`.
     *
     * @returns The number of expired rows deleted.
     */
    async pruneExpired(): Promise<number> {
        await this.#ensureTable();

        const result = await this.#stmt.pruneExpired.bind(this.options.namespace).run();

        return result.meta.changes;
    }

    /**
     * Internal unified implementation for both `get()` and `getWithMetadata()`.
     * Handles single-key and multi-key fetches, supporting `text`, `json`, `arrayBuffer`, and `stream` types.
     */
    async #getImpl<ExpectedValue = unknown>(
        key: Key | Array<Key>,
        type: string,
        withMetadata: boolean
    ) {
        // Select SQL depending on whether metadata is needed.
        const select = withMetadata ? this.#stmt.getWithMetadata : this.#stmt.get;

        // Multiple keys
        if (Array.isArray(key)) {
            // Only "text" or "json" are supported for multi-key reads (KV API parity).
            if (type !== "json" && type !== "text") {
                throw new Error(`"${type}" is not a valid type. Use "json" or "text"`);
            }

            // Prepare one SELECT per key, then execute them in a single D1 batch.
            const stmts = key.map(k => select.bind(this.options.namespace, k));
            const batchResult = await this.d1.batch<{ value: ArrayBuffer, metadata: ArrayBuffer | null }>(stmts);

            // Use a Map to preserve key ordering (like Cloudflare KV does).
            const out = new Map<string, ExpectedValue | KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> | null>();

            // Process each result.
            for (let i = 0; i < key.length; i++) {
                const k = key[i] as string;
                const row = batchResult[i]?.results[0] as { value: ArrayBuffer, metadata: ArrayBuffer | null } | null;

                // Key not found → null
                if (!row) {
                    out.set(k, null);
                    continue;
                }

                // Decode the stored value
                const str = this.#decoder.decode(new Uint8Array(row.value));
                const value = type === "json" ? JSON.parse(str) : str;

                // Attach metadata if requested
                out.set(k, withMetadata ? {
                    value,
                    metadata: row.metadata ? JSON.parse(this.#decoder.decode(new Uint8Array(row.metadata))) : null,
                } as KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> : value);
            }

            return out;
        }

        // Single key
        if (type !== "text" && type !== "json" && type !== "arrayBuffer" && type !== "stream") {
            throw new TypeError('Unknown response type. Possible types are "text", "json", "arrayBuffer", and "stream".');
        }

        // Run a single SELECT
        const row = await select.bind(this.options.namespace, key).first<{ value: ArrayBuffer, metadata: ArrayBuffer | null }>();

        // Return null result (or null + metadata) if not found
        if (!row) {
            return withMetadata ? {
                value: null,
                metadata: null,
                cacheStatus: null
            } as KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> : null;
        }

        // Decode the value based on requested type
        const value = (() => {
            const u8 = new Uint8Array(row.value);

            // ArrayBuffer: fastest path, no copy beyond slicing.
            if (type === "arrayBuffer") {
                return u8.buffer;
            }

            // Stream: synthetic ReadableStream wrapper for API compatibility.
            if (type === "stream") {
                return new ReadableStream({
                    start(c) { c.enqueue(u8); c.close(); }
                });
            }

            // Text or JSON: decode to UTF-8 string, then parse if needed.
            const val = this.#decoder.decode(u8);
            return type === "json" ? JSON.parse(val) : val;
        })();

        // Wrap in metadata if requested
        return withMetadata ? {
            value,
            metadata: row.metadata ? JSON.parse(this.#decoder.decode(new Uint8Array(row.metadata))) : null,
            cacheStatus: null
        } as KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> : value;
    }

    async #ensureTable() {
        if (!this.options.table?.autoCreate) return;

        // If schema initialization already started, reuse the same Promise.
        if (!this.#tableReady) {
            this.#tableReady = (async () => {
                await this.#stmt.ensureTable.run();
            })();
        }

        return this.#tableReady;
    }
}

export interface D1Namespace<Key extends string = string> extends KVNamespace<Key> {
    get(
        key: Key,
        options?: Partial<KVNamespaceGetOptions<undefined>>,
    ): Promise<string | null>;
    get(key: Key, type: "text"): Promise<string | null>;
    get<ExpectedValue = unknown>(
        key: Key,
        type: "json",
    ): Promise<ExpectedValue | null>;
    get(key: Key, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
    get(key: Key, type: "stream"): Promise<ReadableStream | null>;
    get(
        key: Key,
        options?: KVNamespaceGetOptions<"text">,
    ): Promise<string | null>;
    get<ExpectedValue = unknown>(
        key: Key,
        options?: KVNamespaceGetOptions<"json">,
    ): Promise<ExpectedValue | null>;
    get(
        key: Key,
        options?: KVNamespaceGetOptions<"arrayBuffer">,
    ): Promise<ArrayBuffer | null>;
    get(
        key: Key,
        options?: KVNamespaceGetOptions<"stream">,
    ): Promise<ReadableStream | null>;
    get(key: Array<Key>, type: "text"): Promise<Map<string, string | null>>;
    get<ExpectedValue = unknown>(
        key: Array<Key>,
        type: "json",
    ): Promise<Map<string, ExpectedValue | null>>;
    get(
        key: Array<Key>,
        options?: Partial<KVNamespaceGetOptions<undefined>>,
    ): Promise<Map<string, string | null>>;
    get(
        key: Array<Key>,
        options?: KVNamespaceGetOptions<"text">,
    ): Promise<Map<string, string | null>>;
    get<ExpectedValue = unknown>(
        key: Array<Key>,
        options?: KVNamespaceGetOptions<"json">,
    ): Promise<Map<string, ExpectedValue | null>>;
    list<Metadata = unknown>(
        options?: KVNamespaceListOptions,
    ): Promise<KVNamespaceListResult<Metadata, Key>>;
    put(
        key: Key,
        value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
        options?: KVNamespacePutOptions,
    ): Promise<void>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        options?: Partial<KVNamespaceGetOptions<undefined>>,
    ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        type: "text",
    ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
    getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
        key: Key,
        type: "json",
    ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        type: "arrayBuffer",
    ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        type: "stream",
    ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        options: KVNamespaceGetOptions<"text">,
    ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
    getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
        key: Key,
        options: KVNamespaceGetOptions<"json">,
    ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        options: KVNamespaceGetOptions<"arrayBuffer">,
    ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Key,
        options: KVNamespaceGetOptions<"stream">,
    ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
    getWithMetadata<Metadata = unknown>(
        key: Array<Key>,
        type: "text",
    ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
    getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
        key: Array<Key>,
        type: "json",
    ): Promise<
        Map<string, KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>
    >;
    getWithMetadata<Metadata = unknown>(
        key: Array<Key>,
        options?: Partial<KVNamespaceGetOptions<undefined>>,
    ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
    getWithMetadata<Metadata = unknown>(
        key: Array<Key>,
        options?: KVNamespaceGetOptions<"text">,
    ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
    getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
        key: Array<Key>,
        options?: KVNamespaceGetOptions<"json">,
    ): Promise<
        Map<string, KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>
    >;
    delete(key: Key): Promise<void>;
    pruneExpired(): Promise<number>;
}
