import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { ConfigManager } from "../../src/utils/config";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

describe("ConfigManager", () => {
  let testDir: string;
  const originalCwd = process.cwd();

  before(() => {
    testDir = mkdtempSync(join(tmpdir(), 'config-test-'));
    const packageJson = {
      name: "test-package",
      prismaMigrations: {
        migrationsDir: "./custom-migrations",
        tableName: "custom_migrations_table"
      }
    };
    writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  });

  test("should load default configuration", () => {
    const configManager = new ConfigManager();
    const config = configManager.getConfig();

    assert.strictEqual(config.migrationsDir, "./migrations");
    assert.strictEqual(config.schemaPath, "./prisma/schema.prisma");
    assert.strictEqual(config.tableName, "_prisma_migrations");
    assert.strictEqual(config.createTable, true);
  });

  test("should load configuration from package.json", async () => {
    process.chdir(testDir);

    const configManager = new ConfigManager();
    const config = await configManager.getConfigAsync();

    assert.strictEqual(config.migrationsDir, "./custom-migrations");
    assert.strictEqual(config.tableName, "custom_migrations_table");
    assert.strictEqual(config.schemaPath, "./prisma/schema.prisma"); // default value

    process.chdir(originalCwd);
  });

  test("should update configuration", () => {
    const configManager = new ConfigManager();

    configManager.updateConfig({
      migrationsDir: "./updated-migrations",
      tableName: "updated_table",
    });

    const config = configManager.getConfig();
    assert.strictEqual(config.migrationsDir, "./updated-migrations");
    assert.strictEqual(config.tableName, "updated_table");
  });

  test("should get database URL from environment", () => {
    const originalEnv = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const configManager = new ConfigManager();
    const url = configManager.getDatabaseUrl();

    assert.strictEqual(url, "postgresql://test:test@localhost:5432/test");

    // Restore original environment
    if (originalEnv) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  test("should throw error when database URL is not found", () => {
    const originalEnv = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const configManager = new ConfigManager();

    assert.throws(() => {
      configManager.getDatabaseUrl();
    }, /Database URL not found/);

    // Restore original environment
    if (originalEnv) {
      process.env.DATABASE_URL = originalEnv;
    }
  });

  after(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });
});
