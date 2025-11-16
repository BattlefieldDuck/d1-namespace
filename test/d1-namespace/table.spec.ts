import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { D1Namespace } from "../../lib/src/index";

describe("[D1] Custom table name and autoCreate option", async () => {
    const key = "KEY";
    const value = "123456789";

    test('uses custom table "custom_kv" with autoCreate enabled', async () => {
        const d1 = new D1Namespace(env.DB, { table: { name: "custom_kv" } });
        await d1.put(key, value);
        expect(await d1.get(key)).toBe(value);
    });

    test('fails when custom table "custom_kv" does not exist and autoCreate is false', async () => {
        const d1 = new D1Namespace(env.DB, { table: { name: "custom_kv", autoCreate: false } });
        // Expected: Error: no such table: custom_kv (SQLITE_ERROR)
        await expect(d1.put(key, value)).rejects.toThrow(Error);
    });

    test('rejects invalid table name containing SQL injection payload', () => {
        // Error: Invalid table name "kv; DROP TABLE users;".
        // Allowed characters: A-Z, a-z, 0-9, and _.
        // No spaces, punctuation, unicode, or special symbols are permitted.
        expect(
            () => new D1Namespace(env.DB, { table: { name: "kv; DROP TABLE users;" } })
        ).toThrow(Error);
    });
});
