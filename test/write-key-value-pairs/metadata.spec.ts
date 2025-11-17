import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";
import { expectEqual } from "../utils";

// https://developers.cloudflare.com/kv/api/write-key-value-pairs/#metadata
// To associate metadata with a key-value pair, set metadata in the put() options to an object (serializable to JSON):
describe("[KV Parity] Write key-value pairs: Metadata", async () => {
    const key = "KEY", value = "123456789";

    const cases = [
        { metadata: () => ({ someMetadataKey: "someMetadataValue" }) }, // object
        { metadata: () => 123456789 },                                  // number
        { metadata: () => true },                                       // boolean
        { metadata: () => false },                                      // boolean
        { metadata: () => null },                                       // null
        { metadata: () => undefined },                                  // undefined
        { metadata: () => "string-metadata" },                          // string
        { metadata: () => ["a", "b", "c"] },                            // string array
        { metadata: () => [{ nested: true }] },                         // array of objects
        { metadata: () => ({ nested: { level: 2 } }) },                 // deep object
        { metadata: () => ({ a: 1, b: [2, 3], c: { d: "e" } }) },       // mixed structure
        { metadata: () => new Date() },                                 // Date object
    ]

    for (const { metadata } of cases) {
        test(`put("${key}", "${value}", { metadata: ${JSON.stringify(metadata())} })`, async () => {
            const stores = [env.KV_NAMESPACE, new D1Namespace(env.DB)];
            await Promise.all(stores.map(kv => kv.put(key, value, { metadata: metadata() })));
            const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.get(key)));
            await expectEqual([kvResult, d1Result]);
        });
    }

    const invalidCases = [
        { metadata: () => Symbol("id") },              // not JSON-serializable - [mf:error] SyntaxError: Unexpected end of JSON input
        { metadata: () => BigInt(1234567890123456) },  // not JSON-serializable
    ];

    for (const { metadata } of invalidCases) {
        test(`put("${key}", "${value}", { metadata: ${String(metadata())} })`, async () => {
            const stores = [env.KV_NAMESPACE, new D1Namespace(env.DB)];
            for (const kv of stores) {
                await expect(kv.put(key, value, { metadata: metadata() })).rejects.toThrow();
            }
        });
    }
});
