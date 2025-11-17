import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";
import { expectEqual } from "../utils";
import { singleKeyCases, multipleKeysCases } from "./get-method-cases";

describe("[KV Parity] Read key-value pairs: get() method", async () => {
    for (const { key, type, value } of singleKeyCases) {
        test(`get("${key}", "${type}")`, async () => {
            const stores = [env.KV_NAMESPACE, new D1Namespace(env.DB)];
            if (value !== null) {
                await Promise.all(stores.map(kv => kv.put(key, value())));
            }
            const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.get(key, type as any)));
            await expectEqual([kvResult, d1Result]);
        });
    }

    for (const { putKeys, keys, type, value } of multipleKeysCases) {
        test(`Case: get(${JSON.stringify(keys)}, "${type}")`, async () => {
            const stores = [env.KV_NAMESPACE, new D1Namespace(env.DB)];
            const testData = putKeys.map((k, i) => ({ key: k, value: value(i) }));
            await Promise.all(testData.flatMap(({ key, value }) => stores.map(kv => kv.put(key, value))));
            const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.get(keys, type as any)));
            await expectEqual([kvResult, d1Result]);
        });
    }
});

describe("[D1] get() method", async () => {
    const cases = [
        { key: "KEY", type: "INVALID_TYPE", error: TypeError },
        { key: ["KEY_1", "KEY_2"], type: "arrayBuffer", error: Error },
    ];

    for (const { key, type, error } of cases) {
        test(`get(${JSON.stringify(key)}, "${type}")`, async () => {
            const d1 = new D1Namespace(env.DB);
            await expect(d1.get(key as any, type as any)).rejects.toThrow(error);
        });
    }
});
