import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";
import { expectEqual } from "../utils";

const cases = [
    { n: 0, metdata: false, options: undefined },
    { n: 10, metdata: false, options: undefined },
    { n: 10, metdata: true, options: undefined },
    { n: 10, metdata: false, options: { limit: 5 } },
    { n: 10, metdata: true, options: { limit: 5 } },
    { n: 10, metdata: true, options: { limit: 3 } },
    { n: 10, metdata: true, options: { prefix: "KEY_1" } },
    { n: 10, metdata: true, options: { prefix: "NO_MATCH_" } },
    { n: 100, metdata: false, options: undefined },
] as {
    n: number;
    metdata: boolean;
    options?: KVNamespaceListOptions;
}[];

const init = async (kvs: KVNamespace[], n: number, metadata: boolean) => {
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < n; i++) {
        const key = `KEY_${i}`;
        const options = metadata ? { metadata: { key: `METADATA_${i}` } } : {};

        for (const kv of kvs) {
            promises.push(kv.put(key, "", options));
        }
    }

    await Promise.all(promises);
};

describe("[KV Parity] List keys: list() method", async () => {
    const kvs = [
        env.KV_NAMESPACE,
        new D1Namespace(env.DB),
    ];

    for (const { n, metdata, options } of cases) {
        test(`list(${options ? JSON.stringify(options) : ""})`, async () => {
            await init(kvs, n, metdata);

            let [kvResult, d1Result] = await Promise.all(kvs.map((kv) => kv.list(options)));

            while (true) {
                // 1. list_complete must always match
                expect(kvResult.list_complete).toEqual(d1Result.list_complete);

                // 2. keys must always match
                await expectEqual([kvResult.keys, d1Result.keys]);

                // 3. If both are complete, we’re done
                if (kvResult.list_complete || d1Result.list_complete) {
                    // d1Result.list_complete is already asserted equal above
                    break;
                }

                // 4. If not complete, cursors must match
                expect(kvResult.cursor).toEqual(d1Result.cursor);
                const cursor = kvResult.cursor;
                expect(cursor).toBeTruthy(); // optional extra safety

                // 5. Fetch next page with that cursor
                const [nextKvResult, nextD1Result] = await Promise.all(
                    kvs.map((kv) => kv.list({ ...options, cursor })),
                );

                kvResult = nextKvResult;
                d1Result = nextD1Result;
            }
        });
    }
});
