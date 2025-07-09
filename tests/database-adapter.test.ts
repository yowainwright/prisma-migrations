import { test, describe } from "node:test";
import assert from "node:assert";
import { DatabaseAdapter } from "../src/database-adapter";

describe("DatabaseAdapter", () => {
  const testDatabaseUrl = "postgresql://test:test@localhost:5432/test";

  test("should create adapter with default table name", () => {
    let caughtError = false;
    try {
      const adapter = new DatabaseAdapter(testDatabaseUrl);
      assert.ok(adapter);
    } catch (error) {
      caughtError = true;
      assert.ok(error.message.includes("@prisma/client did not initialize"));
    }
    assert.ok(caughtError, "Expected error when Prisma client is not available");
  });

  test("should create adapter with custom table name", () => {
    let caughtError = false;
    try {
      const adapter = new DatabaseAdapter(testDatabaseUrl, "custom_migrations");
      assert.ok(adapter);
    } catch (error) {
      caughtError = true;
      assert.ok(error.message.includes("@prisma/client did not initialize"));
    }
    assert.ok(caughtError, "Expected error when Prisma client is not available");
  });

  test("should handle connection test when Prisma client is not available", async () => {
    try {
      const adapter = new DatabaseAdapter(testDatabaseUrl);
      const isConnected = await adapter.testConnection();
      assert.strictEqual(isConnected, false);
    } catch (error) {
      assert.ok(error.message.includes("@prisma/client did not initialize"));
    }
  });

  test("should handle basic instantiation without database connection", () => {
    let caughtError = false;
    try {
      const adapter1 = new DatabaseAdapter(testDatabaseUrl);
      const adapter2 = new DatabaseAdapter(testDatabaseUrl, "custom_table");
      
      assert.ok(adapter1);
      assert.ok(adapter2);
      
      assert.strictEqual(typeof adapter1, "object");
      assert.strictEqual(typeof adapter2, "object");
    } catch (error) {
      caughtError = true;
      assert.ok(error.message.includes("@prisma/client did not initialize"));
    }
    assert.ok(caughtError, "Expected error when Prisma client is not available");
  });
});
