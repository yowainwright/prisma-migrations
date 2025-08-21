import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileManager } from "../../src/managers/file";
import { MigrationConfig } from "../../src/utils/types";

describe("FileManager", () => {
  const testDir = join(process.cwd(), "test-migrations");
  let fileManager: FileManager;
  const testConfig: MigrationConfig = {
    migrationsDir: testDir,
    schemaPath: "./prisma/schema.prisma",
    tableName: "_prisma_migrations",
    createTable: true,
    migrationFormat: "sql",
    extension: ".sql",
  };

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    fileManager = new FileManager(testDir, testConfig);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("should create migrations directory if it does not exist", () => {
    const newDir = join(process.cwd(), "new-test-migrations");
    if (existsSync(newDir)) {
      rmSync(newDir, { recursive: true });
    }

    const newConfig = { ...testConfig, migrationsDir: newDir };
    new FileManager(newDir, newConfig);
    assert.strictEqual(existsSync(newDir), true);

    rmSync(newDir, { recursive: true });
  });

  test("should create a migration file", () => {
    const migrationFile = fileManager.createMigrationFile("create_users_table");

    assert.strictEqual(existsSync(migrationFile.path), true);
    assert.strictEqual(migrationFile.name, "create_users_table");
    assert.match(migrationFile.timestamp, /^\d{14}$/);
    assert.match(migrationFile.content, /-- UP/);
    assert.match(migrationFile.content, /-- DOWN/);
    assert.match(migrationFile.content, /Migration: create_users_table/);
  });

  test("should create migration file with custom template", () => {
    const template = {
      up: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
      down: "DROP TABLE users;",
    };

    const migrationFile = fileManager.createMigrationFile(
      "create_users_table",
      template,
    );

    assert.match(migrationFile.content, /CREATE TABLE users/);
    assert.match(migrationFile.content, /DROP TABLE users/);
  });

  test("should read migration files", () => {
    fileManager.createMigrationFile("first_migration");
    fileManager.createMigrationFile("second_migration");

    const files = fileManager.readMigrationFiles();

    assert.strictEqual(files.length, 2);
    assert.strictEqual(files[0].name, "first_migration");
    assert.strictEqual(files[1].name, "second_migration");
    assert.match(files[0].timestamp, /^\d{14}$/);
    assert.match(files[1].timestamp, /^\d{14}$/);
  });

  test("should get migration file by timestamp", () => {
    const created = fileManager.createMigrationFile("test_migration");
    const found = fileManager.getMigrationFile(created.timestamp);

    assert.strictEqual(found?.name, "test_migration");
    assert.strictEqual(found?.timestamp, created.timestamp);
  });

  test("should get migration file by name", () => {
    const created = fileManager.createMigrationFile("test_migration");
    const found = fileManager.getMigrationByName("test_migration");

    assert.strictEqual(found?.name, "test_migration");
    assert.strictEqual(found?.timestamp, created.timestamp);
  });

  test("should return null for non-existent migration", () => {
    const found = fileManager.getMigrationFile("nonexistent");
    assert.strictEqual(found, null);
  });

  test("should get latest migration", () => {
    fileManager.createMigrationFile("first_migration");
    const start = Date.now();
    while (Date.now() - start < 1000) {}
    fileManager.createMigrationFile("second_migration");

    const latest = fileManager.getLatestMigration();
    assert.strictEqual(latest?.name, "second_migration");
  });

  test("should parse migration content correctly", () => {
    const template = {
      up: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
      down: "DROP TABLE users;",
    };

    const migrationFile = fileManager.createMigrationFile(
      "create_users_table",
      template,
    );

    const parsed = fileManager.parseMigrationContent(migrationFile);

    assert.match(parsed.up, /CREATE TABLE users/);
    assert.match(parsed.down, /DROP TABLE users/);
  });

  test("should handle migration content without DOWN section", () => {
    const template = {
      up: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
      down: "",
    };

    const migrationFile = fileManager.createMigrationFile(
      "create_users_table",
      template,
    );

    const parsed = fileManager.parseMigrationContent(migrationFile);

    assert.match(parsed.up, /CREATE TABLE users/);
    assert.strictEqual(parsed.down, "");
  });

  test("should delete migration file", () => {
    const created = fileManager.createMigrationFile("test_migration");
    assert.strictEqual(existsSync(created.path), true);

    const deleted = fileManager.deleteMigrationFile(created.timestamp);
    assert.strictEqual(deleted, true);
    assert.strictEqual(existsSync(created.path), false);
  });

  test("should return false when deleting non-existent file", () => {
    const deleted = fileManager.deleteMigrationFile("nonexistent");
    assert.strictEqual(deleted, false);
  });

  test("should throw error for invalid migration file format", () => {
    const invalidFile = join(testDir, "invalid-name.sql");
    writeFileSync(invalidFile, "SELECT 1;");

    assert.throws(() => {
      fileManager.readMigrationFiles();
    }, /Invalid migration file format/);
  });
});
