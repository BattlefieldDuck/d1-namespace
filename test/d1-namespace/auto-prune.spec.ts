import { test, expect, describe } from "vitest";
import { D1Namespace, D1NamespaceOptions } from "../../lib/src/index";
import { env } from "cloudflare:test";

const cases = [
    {
        pruneExpiredKeysOn: ["put"],
        trigger: (d1: D1Namespace) => d1.put("key", "value")
    },
    {
        pruneExpiredKeysOn: ["delete"],
        trigger: (d1: D1Namespace) => d1.delete("key")
    },
    {
        pruneExpiredKeysOn: ["get"],
        trigger: (d1: D1Namespace) => d1.get("key")
    },
    {
        pruneExpiredKeysOn: ["getWithMetadata"],
        trigger: (d1: D1Namespace) => d1.getWithMetadata("key")
    },
    {
        pruneExpiredKeysOn: ["list"],
        trigger: (d1: D1Namespace) => d1.list()
    },
] as Array<{ pruneExpiredKeysOn: D1NamespaceOptions["pruneExpiredKeysOn"], trigger: (d1: D1Namespace) => Promise<unknown> }>;

describe("[D1] Auto-pruning expired KV pairs", async () => {
    for (const { pruneExpiredKeysOn, trigger } of cases) {
        test(`{ pruneExpiredKeysOn: ${JSON.stringify(pruneExpiredKeysOn)} }`, async () => {
            const kv = new D1Namespace(env.DB, { pruneExpiredKeysOn });

            // Insert one live key and one soon-to-expire key
            await kv.put("alive", "value-alive", { expirationTtl: 5 });
            await kv.put("expired", "value-expired", { expirationTtl: 1 });

            // Wait long enough for "expired" to become stale but "alive" still valid
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Trigger the operation that may invoke auto-prune,
            // depending on pruneExpiredKeysOn
            await trigger(kv);

            // A manual prune afterwards should find no additional expired keys
            const extraDeleted = await kv.pruneExpired();
            expect(extraDeleted).toBe(0);

            // "alive" should remain, "expired" should already be pruned
            expect(await kv.get("alive")).toBe("value-alive");
            expect(await kv.get("expired")).toBeNull();

            // Run delete() once to ensure delete() remains covered regardless of options
            await kv.delete("alive");
        });
    }
});
