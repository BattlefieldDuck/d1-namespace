import path from "node:path";
import {
    defineWorkersProject,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
    // Read all migrations in the `migrations` directory
    const migrationsPath = path.join(__dirname, "migrations");
    const migrations = await readD1Migrations(migrationsPath);

    return {
        test: {
            setupFiles: ["./test/apply-migrations.ts"],
            poolOptions: {
                workers: {
                    wrangler: {
                        configPath: "./wrangler.jsonc",
                    },
                    miniflare: {
                        // Add a test-only binding for migrations, so we can apply them in a
                        // setup file
                        bindings: { TEST_MIGRATIONS: migrations },
                    },
                },
            },
            coverage: {
                provider: "istanbul",
                reporter: ["text", "html", "json-summary"],
                include: ["lib/**/*.ts"], // your library code
                exclude: [],
                reportsDirectory: "./coverage",
            },
        }
    };
});
