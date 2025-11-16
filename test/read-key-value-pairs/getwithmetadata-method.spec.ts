import { env } from "cloudflare:test";
import { describe, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";
import { expectEqual } from "../utils";
import { singleKeyCases, multipleKeysCases } from "./get-method-cases";

describe("[KV Parity] Read key-value pairs: getWithMetadata() method", async () => {
    const stores = [
        env.KV_NAMESPACE,
        new D1Namespace(env.DB)
    ];

    const metadatas = [
        "string-metadata",
        12345,
        true,
        false,
        null,
        undefined,
        {},
        [],
        { key: "value" },
        [{ key: "value" }],
        [1, 2, 3],
        { user: { id: 1, name: "alice" } },
    ];

    for (const { key, type, value } of singleKeyCases) {
        for (const metadata of metadatas) {
            test(`getWithMetadata("${key}", "${type}") with metadata: ${JSON.stringify(metadata)}`, async () => {
                if (value !== null) {
                    await Promise.all(stores.map(kv => kv.put(key, value(), { metadata })));
                }
                const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.getWithMetadata(key, type as any)));
                await expectEqual([kvResult, d1Result]);
            });
        }
    }

    for (const { putKeys, keys, type, value } of multipleKeysCases) {
        for (const metadata of metadatas) {
            test(`getWithMetadata(${JSON.stringify(keys)}, "${type}") with metadata: ${JSON.stringify(metadata)}`, async () => {
                const testData = putKeys.map((k, i) => ({ key: k, value: value(i) }));
                await Promise.all(testData.flatMap(({ key, value }) => stores.map(kv => kv.put(key, value, { metadata }))));
                const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.getWithMetadata(keys, type as any)));
                await expectEqual([kvResult, d1Result]);
            });
        }
    }
});
