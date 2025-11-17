import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";

describe("[KV Parity] Delete key-value pairs: delete() method", async () => {
    const key = "KEY", value = "123456789";

    test(`delete("${key}")`, async () => {
        const stores = [env.KV_NAMESPACE, new D1Namespace(env.DB)];

        // Put the same key/value into all KV namespaces (e.g. KV and D1)
        await Promise.all(stores.map(kv => kv.put(key, value)));

        // Verify the key exists before deletion
        {
            const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.get(key)));
            expect(kvResult).not.toBeNull();
            expect(d1Result).not.toBeNull();
        }

        // Delete the key from all KV namespaces
        await Promise.all(stores.map(kv => kv.delete(key)));

        // Verify the key no longer exists after deletion
        {
            const [kvResult, d1Result] = await Promise.all(stores.map(kv => kv.get(key)));
            expect(kvResult).toBeNull();
            expect(d1Result).toBeNull();
        }
    });
});
