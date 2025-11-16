import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";

describe("[D1] put() method", async () => {
    const d1 = new D1Namespace(env.DB);
    const cases = [
        { key: "KEY", value: 12345, options: undefined, error: TypeError },
        { key: "KEY", value: "VALUE", options: { expirationTtl: -1 }, error: RangeError },
        { key: "KEY", value: "VALUE", options: { expiration: Math.floor(Date.now() / 1000) - 1 }, error: RangeError },
    ]

    for (const { key, value, options, error } of cases) {
        test(`put(${JSON.stringify(key)}, ${JSON.stringify(value)})`, async () => {
            await expect(d1.put(key as any, value as any, options as any)).rejects.toThrow(error);
        });
    }
});
