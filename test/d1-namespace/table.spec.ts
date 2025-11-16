import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";

describe("[D1] Custom table name and autoCreate option", async () => {
    const key = "KEY", value = "123456789";

    test(`d1.put("${key}", "${value}")`, async () => {
        const d1 = new D1Namespace(env.DB, { table: { name: "custom_kv" } });
        await d1.put(key, value);
        expect(await d1.get(key)).toBe(value);
    });

    test(`d1.put("${key}", "${value}")`, async () => {
        const d1 = new D1Namespace(env.DB, { table: { name: "custom_kv", autoCreate: false } });
        // Error: no such table: custom_kv: SQLITE_ERROR
        await expect(d1.put(key, value)).rejects.toThrow(Error);
    });
});
