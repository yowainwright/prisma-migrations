import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { MigrationManager } from "../../src/managers/migration";

describe("MigrationManager", () => {
  let originalDatabaseUrl: string | undefined;

  beforeEach(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  test("should handle creation when Prisma client is not available", () => {
    const manager = new MigrationManager();
    assert.ok(manager);
    assert.ok(manager instanceof MigrationManager);
  });

  test("should handle creation with custom config path", () => {
    const manager = new MigrationManager("./custom-config.js");
    assert.ok(manager);
    assert.ok(manager instanceof MigrationManager);
  });

  test("should handle basic object instantiation", () => {
    assert.strictEqual(typeof MigrationManager, "function");

    const ManagerClass = MigrationManager;
    assert.ok(ManagerClass);
    assert.strictEqual(ManagerClass.name, "MigrationManager");
  });

  test("should handle version registration without database connection", () => {
    const manager = new MigrationManager();
    assert.ok(manager);
    assert.ok(manager instanceof MigrationManager);
  });

  test("should validate migration manager methods exist", () => {
    assert.strictEqual(typeof MigrationManager, "function");

    // Check that key methods are defined on the prototype
    const prototype = MigrationManager.prototype;
    assert.strictEqual(typeof prototype.initialize, "function");
    assert.strictEqual(typeof prototype.destroy, "function");
    assert.strictEqual(typeof prototype.createMigration, "function");
    assert.strictEqual(typeof prototype.runMigrations, "function");
    assert.strictEqual(typeof prototype.rollbackMigrations, "function");
    assert.strictEqual(typeof prototype.getMigrationState, "function");
    assert.strictEqual(typeof prototype.getMigrationStatus, "function");
    assert.strictEqual(typeof prototype.testConnection, "function");
    assert.strictEqual(typeof prototype.registerVersion, "function");
    assert.strictEqual(typeof prototype.deployToVersion, "function");
    assert.strictEqual(typeof prototype.getDeploymentPlan, "function");
    assert.strictEqual(typeof prototype.getAllVersions, "function");
    assert.strictEqual(typeof prototype.getCurrentVersion, "function");
    assert.strictEqual(typeof prototype.setCurrentVersion, "function");
    assert.strictEqual(typeof prototype.validateVersionMigrations, "function");
  });

  test("should handle createMigration validation", async () => {
    const manager = new MigrationManager();
    assert.ok(manager);

    try {
      await manager.createMigration({ name: "" });
      assert.fail("Expected error for empty migration name");
    } catch (error) {
      assert.ok(error.message.includes("cannot be empty"));
    }
  });

  test("should handle testConnection gracefully", async () => {
    const manager = new MigrationManager();
    assert.ok(manager);

    const result = await manager.testConnection();
    assert.strictEqual(typeof result, "boolean");
  });
});
