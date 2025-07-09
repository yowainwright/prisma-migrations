import { test, describe } from "node:test";
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
});
