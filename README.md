# D1 Namespace

![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F89D33?style=flat-square&logo=cloudflare&logoColor=white)
![NPM Type Definitions](https://img.shields.io/npm/types/d1-namespace)
[![coverage](https://img.shields.io/endpoint?url=https://battlefieldduck.github.io/d1-namespace/badge.json)](https://battlefieldduck.github.io/d1-namespace/coverage/)
[![NPM Version](https://img.shields.io/npm/v/d1-namespace)](https://www.npmjs.com/package/d1-namespace)
![NPM Downloads](https://img.shields.io/npm/dw/d1-namespace)
![NPM Downloads](https://img.shields.io/npm/d18m/d1-namespace)
![NPM License](https://img.shields.io/npm/l/d1-namespace)

Cloudflare KV-compatible key-value storage implemented on top of Cloudflare D1.

```ts
// Example usage of the D1 KV store
const kv = new D1Namespace(env.DB);
await kv.put("my-key", "my-value");
const value = await kv.get("my-key");
console.log(`Fetched value from D1 KV: ${value}`); // should log "my-value"
```

## Features

* **Higher read & write limits**

  Built on Cloudflare D1’s generous quotas:
  5 million rows-read per day and 100,000 rows-written per day on the Free plan, and tens of billions per month on the Paid plan. Ideal for heavy KV-like workloads.

* **Cost-efficient compared to Cloudflare KV**

  Your workload will typically cost **0–95% less** depending on volume, especially for read-heavy or moderate write workloads.

* **Cloudflare KV-compatible API**

  Supports the familiar KV methods (`get`, `getWithMetadata`, `put`, `delete`, `list`) with optional metadata and TTLs, behaving similarly to Cloudflare KV.

  ```diff
  - const kv = env.KV_NAMESPACE;
  + const kv = new D1Namespace(env.DB);
  ```

* **One D1 database, unlimited KV namespaces**

  A single D1 database can host unlimited logical KV namespaces by using `(namespace, key)` as the primary key. No need to create or manage multiple KV namespaces.

  ```ts
  const kv1 = new D1Namespace(env.DB, { namespace: "KV_NAMESPACE_1" });
  const kv2 = new D1Namespace(env.DB, { namespace: "KV_NAMESPACE_2" });
  ```

* **Backed by SQL when you need it**

  Because it runs on SQLite (via D1), you can inspect, query, and debug your data with full SQL power — including SELECT, DELETE, migration scripts, and dev tooling.

  ```ts
  const stmt = env.DB.prepare("SELECT COUNT(*) AS count FROM kv WHERE namespace = ?");
  const result = await stmt.bind("").first<{ count: number }>();
  console.log(`Total keys in default namespace: ${result?.count}`);
  ```

## Installation

To install d1-namespace, run the following command in your project directory:

```bash
npm install d1-namespace
```

Bind your Worker to your D1 database on `wrangler.jsonc`.

```jsonc
{
    "$schema": "./node_modules/wrangler/config-schema.json",
    "d1_databases": [
        {
            "binding": "DB",  // replace with your own binding, we use DB as an example
            "database_name": "d1-namespace",  // replace with your own database_name
            "database_id": "<unique-ID-for-your-database>"
        }
    ]
}
```

Learn more: https://developers.cloudflare.com/d1/get-started/#3-bind-your-worker-to-your-d1-database

## Usage

The D1 Namespace behaves almost identically to the KV [Workers Binding API](https://developers.cloudflare.com/kv/api/)

```ts
import { D1Namespace } from "d1-namespace";

export default {
	async fetch(request, env, ctx) {
		// Create D1Namespace instance
		const kv = new D1Namespace(env.DB);

		// Write single key
		await kv.put("first-key", "This is the value for the key");

		// Write single key with metadata and expiration TTL of 15 seconds
		await kv.put("second-key", "This is the value for the second key", {
			metadata: { someMetadataKey: "someMetadataValue" },
			expirationTtl: 15,
		});

		// Write another single key
		await kv.put("third-key", "This is the value for the third key");

		// Delete a key :P
		await kv.delete("third-key");

		// Read single key, returns value or null
		const value = await kv.get("first-key");

		// Read multiple keys, returns Map of values
		const values = await kv.get(["first-key", "second-key", "third-key"]);

		// Read single key with metadata, returns value or null
		const valueWithMetadata = await kv.getWithMetadata("first-key");

		// Read multiple keys with metadata, returns Map of values
		const valuesWithMetadata = await kv.getWithMetadata(["first-key", "second-key", "third-key"]);

		// List all keys
		const list = await kv.list();

		return Response.json({
			value: value,
			values: Object.fromEntries(values),
			valueWithMetadata: valueWithMetadata,
			valuesWithMetadata: Object.fromEntries(valuesWithMetadata),
			list: list,
		});
	},
} satisfies ExportedHandler<Env>;
```

### Expiring keys

Cloudflare KV does not allow expiration times shorter than 60 seconds.
With D1 Namespace, you can set TTLs with just a few seconds.
This provides much finer control for short-lived data, caching, sessions, and temporary state.

```ts
// Cloudflare KV
const kv = env.KV_NAMESPACE;
await kv.put("key", "value for the key", { expirationTtl: 30 });
// ❌ Fails — KV does not allow TTL values below 60 seconds.

// D1 Namespace
const kv = new D1Namespace(env.DB);
await kv.put("key", "value for the key", { expirationTtl: 30 });
// ✅ Works — D1 Namespace supports sub-60-second expirations.
```

## D1 Namespace Options

Configure the behavior of a `D1Namespace` instance.

```ts
export interface D1NamespaceOptions {
  namespace?: string;
  ensureSchema?: boolean;
  pruneExpiredKeysOn?: (
    | "put"
    | "delete"
    | "get"
    | "getWithMetadata"
    | "list"
  )[];
}
```

### `namespace?: string`

Logical namespace that groups key–value pairs.

* Keys are scoped within this namespace.
* Two identical keys in different namespaces do not collide.
* Defaults to an empty string (`""`).

**Example**

```ts
new D1Namespace(env.DB, { namespace: "users" });
```

---

### `ensureSchema?: boolean`

Automatically creates the required `kv` table and indexes if they do not exist.

* Runs only once on the first operation.
* Defaults to `true`.

**Example**

```ts
new D1Namespace(env.DB, { ensureSchema: false });
```

---

### `pruneExpiredKeysOn?: (...)[]`

Controls when expired keys are automatically removed.

* Defaults to `["put", "delete"]`.

Supported triggers:

| Operation           | Meaning                                         |
| ------------------- | ----------------------------------------------- |
| `"put"`             | After inserting or updating a key               |
| `"delete"`          | After deleting a key                            |
| `"get"`             | After reading a key *(not recommended)*         |
| `"getWithMetadata"` | After reading with metadata *(not recommended)* |
| `"list"`            | After listing keys *(use with caution)*         |

**Example**

```ts
new D1Namespace(env.DB, { pruneExpiredKeysOn: ["put", "delete"] });
```

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

![https://github.com/BattlefieldDuck/d1-namespace/graphs/contributors](https://contrib.rocks/image?repo=BattlefieldDuck/d1-namespace)

## License

`d1-namespace` is licensed under the MIT License. See the `LICENSE` file for more details.

## Stargazers over time
[![Stargazers over time](https://starchart.cc/BattlefieldDuck/d1-namespace.svg?variant=adaptive)](https://starchart.cc/BattlefieldDuck/d1-namespace)
