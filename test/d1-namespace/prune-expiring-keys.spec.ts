import { test, expect, describe } from "vitest";
import { D1Namespace } from "../../lib/src/index";
import { env } from "cloudflare:test";

describe("[D1] Prune key-value pairs: pruneExpired() method", async () => {
    test("pruneExpired() removes only expired keys", async () => {
        // Create a KV namespace (defaults to namespace = "")
        // Using a blank namespace avoids cross-test interference.
        const kv = new D1Namespace(env.DB, { ensureSchema: false });

        // Insert two keys:
        // - "alive"   -> expires in ~5 seconds
        // - "expired" -> expires in ~2 seconds
        //
        // Both exist at insert time.
        await kv.put("alive", "value-alive", { expirationTtl: 5 });
        await kv.put("expired", "value-expired", { expirationTtl: 2 });

        // Sanity check: both values should be readable immediately after writing.
        expect(await kv.get("alive")).toBe("value-alive");
        expect(await kv.get("expired")).toBe("value-expired");

        // Wait long enough for "expired" to become stale,
        // but NOT long enough for "alive" (still within 5 seconds).
        await new Promise(resolve => setTimeout(resolve, 2500));

        // pruneExpired() should remove exactly one key:
        // the one with ttl_seconds = 2.
        const count = await kv.pruneExpired();
        expect(count).toBe(1);

        // Validate post-conditions:
        // "alive" should remain, "expired" should be gone.
        expect(await kv.get("alive")).toBe("value-alive");
        expect(await kv.get("expired")).toBeNull();
    });
});
