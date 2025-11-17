import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";

// https://developers.cloudflare.com/kv/api/write-key-value-pairs/#expiring-keys
describe("[D1] Write key-value pairs: Expiring keys", async () => {
    const key = "KEY", value = "123456789";

    test(`put("${key}", string, { expiration: secondsSinceEpoch })`, async () => {
        const d1 = new D1Namespace(env.DB);
        const secondsSinceEpoch = Math.floor(Date.now() / 1000) + 1;
        await d1.put(key, value, { expiration: secondsSinceEpoch });
        await expect(d1.get(key)).resolves.toEqual(value);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await expect(d1.get(key)).resolves.toBeNull();
    });

    test(`put("${key}", string, { expirationTtl: secondsFromNow })`, async () => {
        const d1 = new D1Namespace(env.DB);
        const secondsFromNow = 1;
        await d1.put(key, value, { expirationTtl: secondsFromNow });
        await expect(d1.get(key)).resolves.toEqual(value);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await expect(d1.get(key)).resolves.toBeNull();
    });
});
