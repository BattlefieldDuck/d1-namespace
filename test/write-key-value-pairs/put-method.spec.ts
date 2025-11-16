import { env } from "cloudflare:test";
import { describe, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";
import { expectEqual } from "../utils";

// https://developers.cloudflare.com/kv/api/write-key-value-pairs/#put-method
describe("[KV Parity] Write key-value pairs: put() method", async () => {
    const kvs = [env.KV_NAMESPACE, new D1Namespace(env.DB)];
    const key = "KEY";
    const cases = [
        { type: "string", value: () => "123456789" },
        { type: "ArrayBuffer", value: () => new Uint8Array([0xff, 0x00, 0x01, 0xab]).buffer },
        { type: "ArrayBufferView", value: () => new Uint8Array([0xff, 0x00, 0x01, 0xab]) },
        { type: "ReadableStream", value: () => new Blob(["123456789"]).stream() },
    ]

    for (const { type, value } of cases) {
        test(`put("${key}", ${type})`, async () => {
            await Promise.all(kvs.map(kv => kv.put(key, value())));
            const [kvResult, d1Result] = await Promise.all(kvs.map(kv => kv.get(key)));
            await expectEqual([kvResult, d1Result]);
        });
    }
});
