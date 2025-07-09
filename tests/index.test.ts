import { test, describe } from "node:test";
import assert from "node:assert";
import * as index from "../src/index";

describe("Index module", () => {
  test("should export MigrationManager", () => {
    assert.ok(index.MigrationManager);
    assert.strictEqual(typeof index.MigrationManager, "function");
  });

  test("should export ConfigManager", () => {
    assert.ok(index.ConfigManager);
    assert.strictEqual(typeof index.ConfigManager, "function");
  });

  test("should export FileManager", () => {
    assert.ok(index.FileManager);
    assert.strictEqual(typeof index.FileManager, "function");
  });

  test("should export DatabaseAdapter", () => {
    assert.ok(index.DatabaseAdapter);
    assert.strictEqual(typeof index.DatabaseAdapter, "function");
  });

  test("should export all required types", () => {
    // Types should be available for import
    assert.ok(index);
  });
});
