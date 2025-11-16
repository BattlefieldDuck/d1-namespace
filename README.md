# D1 Namespace

![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F89D33?style=flat-square&logo=cloudflare&logoColor=white)
[![coverage](https://img.shields.io/endpoint?url=https://battlefieldduck.github.io/d1-namespace/badge.json)](https://battlefieldduck.github.io/d1-namespace/coverage/)

Cloudflare KV-compatible key-value storage implemented on top of Cloudflare D1.

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
		// Create D1Namespace instance, ensuring the kv schema is created
		// After the first time, you can remove { ensureSchema: true } for better performance
		const kv = new D1Namespace(env.DB, { ensureSchema: true });

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

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

![https://github.com/BattlefieldDuck/d1-namespace/graphs/contributors](https://contrib.rocks/image?repo=BattlefieldDuck/d1-namespace)

## License

`d1-namespace` is licensed under the MIT License. See the `LICENSE` file for more details.

## Stargazers over time
[![Stargazers over time](https://starchart.cc/BattlefieldDuck/d1-namespace.svg?variant=adaptive)](https://starchart.cc/BattlefieldDuck/d1-namespace)
