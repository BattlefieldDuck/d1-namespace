import { D1NamespaceOptions } from "./d1-options";
import { D1_SQL, sanitizeTableName } from "./d1-sql";
import { base64Decode, base64Encode, readStream } from "./utils";

export class D1Namespace<Key extends string = string> implements KVNamespace<Key> {
    /**
     * Final, normalized, fully-resolved configuration.
     */
    readonly options: Readonly<{
        namespace: string;
        table: { name: string; autoCreate: boolean };
    }>;

    /** Text encoder/decoder for UTF-8 value handling. */
    readonly #encoder = new TextEncoder();
    readonly #decoder = new TextDecoder();

    /**
     * Lazily prepared SQL statements for this table.
     */
    readonly #stmt: {
        get: D1PreparedStatement;
        getWithMetadata: D1PreparedStatement;
        list: D1PreparedStatement;
        put: D1PreparedStatement;
        delete: D1PreparedStatement;
        deleteExpired: D1PreparedStatement;
        ensureTable: D1PreparedStatement;
    };

    /** Ensures CREATE TABLE runs once per instance. */
    #tableReady?: Promise<void>;

    constructor(
        private readonly d1: D1Database,
        options?: D1NamespaceOptions
    ) {
        const namespace = options?.namespace ?? "";
        const tableName = sanitizeTableName(options?.table?.name ?? `${namespace}_kv_entries`);

        this.options = Object.freeze({
            namespace,
            table: {
                name: tableName,
                autoCreate: options?.table?.autoCreate ?? true,
            }
        });

        this.#stmt = {
            get: this.d1.prepare(D1_SQL.get(tableName)),
            getWithMetadata: this.d1.prepare(D1_SQL.getWithMetadata(tableName)),
            list: this.d1.prepare(D1_SQL.list(tableName)),
            put: this.d1.prepare(D1_SQL.put(tableName)),
            delete: this.d1.prepare(D1_SQL.delete(tableName)),
            deleteExpired: this.d1.prepare(D1_SQL.deleteExpired(tableName)),
            ensureTable: this.d1.prepare(D1_SQL.ensureTable(tableName)),
        };
    }

    async get<ExpectedValue = unknown>(
        key: Key | Key[],
        options?: { type?: "text" | "json" | "arrayBuffer" | "stream" } | string
    ) {
        const type = typeof options === "string" ? options : options?.type ?? "text";
        return this.#getImpl<ExpectedValue>(key, type, false);
    }

    async getWithMetadata<ExpectedValue = unknown>(
        key: Key | Key[],
        options?: { type?: "text" | "json" | "arrayBuffer" | "stream" } | string
    ) {
        const type = typeof options === "string" ? options : options?.type ?? "text";
        return this.#getImpl<ExpectedValue>(key, type, true);
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
        await this.#ensureTable();

        const stmt = withMetadata
            ? this.#stmt.getWithMetadata
            : this.#stmt.get;

        // Multi-key batch mode
        if (Array.isArray(key)) {
            if (type !== "json" && type !== "text") {
                throw new Error(`"${type}" is not a valid type. Use "json" or "text"`);
            }

            const stmts = key.map(k => stmt.bind(k));
            const results = await this.d1.batch<{ value: ArrayBuffer, metadata: ArrayBuffer | null }>(stmts);

            const out = new Map<
                string,
                | ExpectedValue
                | KVNamespaceGetWithMetadataResult<ExpectedValue, unknown>
                | null
            >();

            for (let i = 0; i < key.length; i++) {
                const k = key[i]!;
                const row = results[i]?.results?.[0] ?? null;

                if (!row) {
                    out.set(k, null);
                    continue;
                }

                const text = this.#decoder.decode(new Uint8Array(row.value));
                const value = type === "json" ? JSON.parse(text) : text;

                out.set(k, withMetadata ? {
                    value,
                    metadata: row.metadata ? JSON.parse(this.#decoder.decode(new Uint8Array(row.metadata))) : null,
                } as KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> : value);
            }

            return out;
        }

        // Single key
        if (
            type !== "text" &&
            type !== "json" &&
            type !== "arrayBuffer" &&
            type !== "stream"
        ) {
            throw new TypeError('Unknown response type. Possible types are "text", "json", "arrayBuffer", and "stream".');
        }

        const row = await stmt
            .bind(key)
            .first<{ value: ArrayBuffer; metadata: ArrayBuffer | null }>();

        if (!row) {
            return withMetadata ? {
                value: null,
                metadata: null,
                cacheStatus: null,
            } as KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> : null;
        }

        const u8 = new Uint8Array(row.value);

        let value: any;
        switch (type) {
            case "arrayBuffer":
                value = u8.buffer;
                break;
            case "stream":
                value = new ReadableStream({
                    start(c) {
                        c.enqueue(u8);
                        c.close();
                    },
                });
                break;
            case "json":
                value = JSON.parse(this.#decoder.decode(u8));
                break;
            default:
                value = this.#decoder.decode(u8);
        }

        return withMetadata ? {
            value,
            metadata: row.metadata ? JSON.parse(this.#decoder.decode(new Uint8Array(row.metadata))) : null,
            cacheStatus: null,
        } as KVNamespaceGetWithMetadataResult<ExpectedValue, unknown> : value;
    }

    async list<Metadata = unknown>(
        options?: KVNamespaceListOptions
    ): Promise<KVNamespaceListResult<Metadata, Key>> {
        await this.#ensureTable();

        // https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/shared/keyvalue.worker.ts#L233
        const prefix = options?.prefix ?? "";
        const lower = prefix;
        const upper = prefix + "\u{10FFFF}";
        const limit = Math.max(1, Number(options?.limit ?? 1000));
        const startAfter = options?.cursor ? base64Decode(options.cursor) : "";

        const rows = await this.#stmt.list
            .bind(lower, upper, startAfter, limit + 1)
            .all<{ key: string; expiration: number | null; metadata: ArrayBuffer | null }>();

        const hasMore = rows.results.length > limit;
        const page = hasMore
            ? rows.results.slice(0, limit)
            : rows.results;

        const keys = page.map(r => {
            const item: {
                name: Key;
                expiration?: number;
                metadata?: Metadata;
            } = { name: r.key as Key };

            if (typeof r.expiration === "number") item.expiration = r.expiration;
            if (r.metadata) item.metadata = JSON.parse(this.#decoder.decode(new Uint8Array(r.metadata)));

            return item;
        });

        if (hasMore) {
            const last = page[page.length - 1]!.key;
            return {
                keys,
                list_complete: false,
                cursor: base64Encode(last),
                cacheStatus: null,
            };
        }

        return { keys, list_complete: true, cacheStatus: null };
    }

    async put(
        key: Key,
        value: any,
        options?: KVNamespacePutOptions
    ): Promise<void> {
        await this.#ensureTable();
        const now = Math.floor(Date.now() / 1000);

        // Value → Uint8Array
        let bytes: Uint8Array;
        if (typeof value === "string") {
            bytes = this.#encoder.encode(value);
        } else if (value instanceof ArrayBuffer) {
            bytes = new Uint8Array(value);
        } else if (ArrayBuffer.isView(value)) {
            bytes = new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            );
        } else if (value instanceof ReadableStream) {
            bytes = await readStream(value);
        } else {
            throw new TypeError("KV put() accepts only strings, ArrayBuffers, ArrayBufferViews, and ReadableStreams as values.");
        }

        // Expiration → ABSOLUTE timestamp
        let expiration: number | null = null;
        if (options?.expirationTtl != null) {
            if (options.expirationTtl <= 0)
                throw new RangeError(
                    `Invalid expiration_ttl of ${options.expirationTtl}. Please specify integer greater than 0.`
                );
            expiration = now + options.expirationTtl;
        } else if (options?.expiration != null) {
            if (options.expiration <= now)
                throw new RangeError(
                    `Invalid expiration of ${options.expiration}. Please specify integer greater than the current number of seconds since the UNIX epoch.`
                );
            expiration = options.expiration;
        }

        // Metadata → encoded JSON
        let metadata: Uint8Array | null = null;
        if (options?.metadata !== undefined) {
            const str = JSON.stringify(options.metadata);
            if (str === undefined)
                throw new TypeError(
                    "Metadata could not be serialized to JSON."
                );
            metadata = this.#encoder.encode(str);
        }

        // UPSERT + delete expired entries
        await this.d1.batch([
            this.#stmt.put.bind(key, bytes, expiration, metadata),
            this.#stmt.deleteExpired.bind()
        ]);
    }

    async delete(key: Key): Promise<void> {
        await this.#ensureTable();
        await this.d1.batch([this.#stmt.delete.bind(key), this.#stmt.deleteExpired.bind()]);
    }

    async deleteExpired(): Promise<number> {
        await this.#ensureTable();
        const res = await this.#stmt.deleteExpired.run();
        return res.meta.changes;
    }

    async #ensureTable() {
        if (!this.options.table.autoCreate) return;

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
    deleteExpired(): Promise<number>;
}
