import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";

describe("[D1] Automatically ensures that the required KV table exists.", async () => {
    const d1 = new D1Namespace(env.DB, { ensureSchema: true });
    const key = "KEY", value = "123456789";

    test(`d1.put("${key}", "${value}")`, async () => {
        await d1.put(key, value);
        expect(await d1.get(key)).toBe(value);
    });
});
