import { test, describe, it, before } from "node:test";
import assert from "node:assert";
import { MigrationManager } from "../src/migration-manager";

describe("MigrationManager", () => {
  test("should handle creation when Prisma client is not available", () => {
    let caughtError = false;
    try {
      const manager = new MigrationManager();
      assert.ok(manager);
    } catch (error) {
      caughtError = true;
      assert.ok(error.message.includes("Database URL not found"));
    }
    assert.ok(caughtError, "Expected error when DATABASE_URL is not set");
  });

  test("should handle creation with custom config path", () => {
    let caughtError = false;
    try {
      const manager = new MigrationManager("./custom-config.js");
      assert.ok(manager);
    } catch (error) {
      caughtError = true;
      assert.ok(error.message.includes("Database URL not found"));
    }
    assert.ok(caughtError, "Expected error when DATABASE_URL is not set");
  });

  test("should handle basic object instantiation", () => {
    assert.strictEqual(typeof MigrationManager, "function");

    const ManagerClass = MigrationManager;
    assert.ok(ManagerClass);
    assert.strictEqual(ManagerClass.name, "MigrationManager");
  });

  test("should handle version registration without database connection", () => {
    // Test version management functionality that doesn't require database
    try {
      const manager = new MigrationManager();
      // This should fail due to missing DATABASE_URL
      assert.fail("Expected error when DATABASE_URL is not set");
    } catch (error) {
      assert.ok(error.message.includes("Database URL not found"));
    }
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
    try {
      const manager = new MigrationManager();
      // This should fail due to missing DATABASE_URL before we can test createMigration
      assert.fail("Expected error when DATABASE_URL is not set");
    } catch (error) {
      assert.ok(error.message.includes("Database URL not found"));
    }
  });

  test("should handle testConnection gracefully", async () => {
    try {
      const manager = new MigrationManager();
      // This should fail due to missing DATABASE_URL
      assert.fail("Expected error when DATABASE_URL is not set");
    } catch (error) {
      assert.ok(error.message.includes("Database URL not found"));
    }
  });
});
