/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { D1Namespace } from "../lib/src/d1-namespace";

type StoreName = "kv" | "d1";

type BenchOp = "get" | "put" | "list" | "getWithMetadata" | "delete";

type BenchResult = {
	store: StoreName;
	op: BenchOp;
	iterations: number;
	totalMs: number;
	avgMs: number;
};

async function benchOp(
	store: StoreName,
	op: BenchOp,
	iterations: number,
	fn: () => Promise<unknown>,
): Promise<BenchResult> {
	// Small warmup
	for (let i = 0; i < 5; i++) {
		await fn();
	}

	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await fn();
	}
	const totalMs = performance.now() - start;

	return {
		store,
		op,
		iterations,
		totalMs,
		avgMs: totalMs / iterations,
	};
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		const iterations = Number(url.searchParams.get("n") ?? "10");
		const mode = (url.searchParams.get("mode") ?? "all") as
			| "all"
			| "get"
			| "put"
			| "list"
			| "getWithMetadata"
			| "delete";

		// Shared keys/prefixes for both backends
		const singleKey = "bench:key";
		const singleValue = "bench-value";
		const listPrefix = "bench:list:";
		const metaKey = "bench:meta";

		const kv = env.KV_NAMESPACE;
		const d1 = new D1Namespace(env.DB);

		// Seed single key for get/put/delete
		await Promise.all([
			kv.put(singleKey, singleValue),
			d1.put(singleKey, singleValue),
		]);

		// Seed metadata key for getWithMetadata
		const metadata = { foo: "bar", n: 123 };
		await Promise.all([
			kv.put(metaKey, singleValue, { metadata }),
			d1.put(metaKey, singleValue, { metadata }),
		]);

		// Seed a small keyspace for list() benchmarks
		const listCount = 50;
		const listWrites: Promise<unknown>[] = [];
		for (let i = 0; i < listCount; i++) {
			const k = `${listPrefix}${i.toString().padStart(3, "0")}`;
			listWrites.push(kv.put(k, `value-${i}`));
			listWrites.push(d1.put(k, `value-${i}`));
		}
		await Promise.all(listWrites);

		const results: BenchResult[] = [];

		// GET benchmarks
		if (mode === "all" || mode === "get") {
			results.push(
				await benchOp("kv", "get", iterations, () => kv.get(singleKey)),
			);
			results.push(
				await benchOp("d1", "get", iterations, () => d1.get(singleKey)),
			);
		}

		// GET WITH METADATA benchmarks
		if (mode === "all" || mode === "getWithMetadata") {
			results.push(
				await benchOp("kv", "getWithMetadata", iterations, () =>
					kv.getWithMetadata(metaKey),
				),
			);
			results.push(
				await benchOp("d1", "getWithMetadata", iterations, () =>
					d1.getWithMetadata(metaKey),
				),
			);
		}

		// PUT benchmarks (overwrites same key)
		if (mode === "all" || mode === "put") {
			results.push(
				await benchOp("kv", "put", iterations, () =>
					kv.put(singleKey, singleValue),
				),
			);
			results.push(
				await benchOp("d1", "put", iterations, () =>
					d1.put(singleKey, singleValue),
				),
			);
		}

		// LIST benchmarks
		if (mode === "all" || mode === "list") {
			const listOptions: KVNamespaceListOptions = {
				prefix: listPrefix,
				limit: 100,
			};

			results.push(
				await benchOp("kv", "list", iterations, () => kv.list(listOptions)),
			);
			results.push(
				await benchOp("d1", "list", iterations, () => d1.list(listOptions)),
			);
		}

		// DELETE benchmarks
		if (mode === "all" || mode === "delete") {
			// Re-seed the key once so the first delete hits an existing row
			await Promise.all([
				kv.put(singleKey, singleValue),
				d1.put(singleKey, singleValue),
			]);

			results.push(
				await benchOp("kv", "delete", iterations, () => kv.delete(singleKey)),
			);
			results.push(
				await benchOp("d1", "delete", iterations, () => d1.delete(singleKey)),
			);
		}

		return Response.json({
			iterations,
			mode,
			listPrefix,
			results,
		});
	},
} satisfies ExportedHandler<Env>;
