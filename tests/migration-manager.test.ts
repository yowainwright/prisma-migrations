import { test, describe, mock } from "node:test";
import assert from "node:assert";
import { MigrationManager } from "../src/migration-manager";

// Mock dependencies
const mockConfigManager = {
  getConfig: mock.fn(() => ({
    migrationsDir: "./migrations",
    schemaPath: "./prisma/schema.prisma",
    tableName: "_prisma_migrations",
    createTable: true,
    migrationFormat: "ts",
    extension: ".ts",
  })),
  getDatabaseUrl: mock.fn(() => "postgresql://test:test@localhost:5432/test"),
  updateConfig: mock.fn(),
};

const mockFileManager = {
  createMigrationFile: mock.fn(),
  readMigrationFiles: mock.fn(() => []),
  getMigrationFile: mock.fn(),
  getMigrationByName: mock.fn(),
  parseMigrationContent: mock.fn(),
};

const mockDatabaseAdapter = {
  connect: mock.fn(),
  disconnect: mock.fn(),
  ensureMigrationsTable: mock.fn(),
  getAppliedMigrations: mock.fn(() => []),
  isMigrationApplied: mock.fn(() => false),
  recordMigration: mock.fn(),
  removeMigration: mock.fn(),
  executeMigration: mock.fn(),
  executeMigrationFile: mock.fn(),
  testConnection: mock.fn(() => true),
};

// Mock modules
mock.module("../src/config", () => ({
  ConfigManager: function () {
    return mockConfigManager;
  },
}));

mock.module("../src/file-manager", () => ({
  FileManager: function () {
    return mockFileManager;
  },
}));

mock.module("../src/database-adapter", () => ({
  DatabaseAdapter: function () {
    return mockDatabaseAdapter;
  },
}));

describe("MigrationManager", () => {
  test("should create migration manager with default config", () => {
    const manager = new MigrationManager();
    assert.ok(manager);
    assert.strictEqual(mockConfigManager.getConfig.mock.callCount(), 1);
  });

  test("should create migration manager with custom config path", () => {
    const manager = new MigrationManager("./custom-config.js");
    assert.ok(manager);
  });

  test("should create migration", async () => {
    const mockMigrationFile = {
      id: "20231201120000",
      name: "test_migration",
      filename: "20231201120000_test_migration.ts",
      path: "./migrations/20231201120000_test_migration.ts",
      type: "ts" as const,
      timestamp: new Date(),
    };

    mockFileManager.createMigrationFile.mock.mockImplementation(() =>
      Promise.resolve(mockMigrationFile),
    );

    const manager = new MigrationManager();
    const result = await manager.createMigration({ name: "test_migration" });

    assert.ok(result);
    assert.strictEqual(result.name, "test_migration");
    assert.strictEqual(mockFileManager.createMigrationFile.mock.callCount(), 1);
  });

  test("should get migration status", async () => {
    const mockFileResults = [
      {
        id: "20231201120000",
        name: "test_migration",
        filename: "20231201120000_test_migration.ts",
        path: "./migrations/20231201120000_test_migration.ts",
        type: "ts" as const,
        timestamp: new Date(),
      },
    ];

    const mockDbResults = [
      {
        id: "20231201120000",
        name: "test_migration",
        filename: "20231201120000_test_migration.ts",
        timestamp: new Date(),
        applied: true,
        appliedAt: new Date(),
      },
    ];

    mockFileManager.readMigrationFiles.mock.mockImplementation(() =>
      Promise.resolve(mockFileResults),
    );
    mockDatabaseAdapter.getAppliedMigrations.mock.mockImplementation(() =>
      Promise.resolve(mockDbResults),
    );

    const manager = new MigrationManager();
    const status = await manager.getMigrationStatus();

    assert.ok(Array.isArray(status));
    assert.strictEqual(mockDatabaseAdapter.connect.mock.callCount(), 1);
    assert.strictEqual(
      mockDatabaseAdapter.ensureMigrationsTable.mock.callCount(),
      1,
    );
    assert.strictEqual(mockDatabaseAdapter.disconnect.mock.callCount(), 1);
  });

  test("should run migrations", async () => {
    const mockFileResults = [
      {
        id: "20231201120000",
        name: "test_migration",
        filename: "20231201120000_test_migration.ts",
        path: "./migrations/20231201120000_test_migration.ts",
        type: "ts" as const,
        timestamp: new Date(),
      },
    ];

    mockFileManager.readMigrationFiles.mock.mockImplementation(() =>
      Promise.resolve(mockFileResults),
    );
    mockDatabaseAdapter.getAppliedMigrations.mock.mockImplementation(() =>
      Promise.resolve([]),
    );
    mockDatabaseAdapter.isMigrationApplied.mock.mockImplementation(() =>
      Promise.resolve(false),
    );

    const manager = new MigrationManager();
    const result = await manager.runMigrations();

    assert.ok(result);
    assert.strictEqual(result.success, true);
    assert.strictEqual(mockDatabaseAdapter.connect.mock.callCount(), 1);
    assert.strictEqual(mockDatabaseAdapter.disconnect.mock.callCount(), 1);
  });

  test("should rollback migrations", async () => {
    const mockAppliedMigrations = [
      {
        id: "20231201120000",
        name: "test_migration",
        filename: "20231201120000_test_migration.ts",
        timestamp: new Date(),
        applied: true,
        appliedAt: new Date(),
      },
    ];

    const mockFileResults = [
      {
        id: "20231201120000",
        name: "test_migration",
        filename: "20231201120000_test_migration.ts",
        path: "./migrations/20231201120000_test_migration.ts",
        type: "ts" as const,
        timestamp: new Date(),
      },
    ];

    mockDatabaseAdapter.getAppliedMigrations.mock.mockImplementation(() =>
      Promise.resolve(mockAppliedMigrations),
    );
    mockFileManager.readMigrationFiles.mock.mockImplementation(() =>
      Promise.resolve(mockFileResults),
    );

    const manager = new MigrationManager();
    const result = await manager.rollbackMigrations();

    assert.ok(result);
    assert.strictEqual(result.success, true);
    assert.strictEqual(mockDatabaseAdapter.connect.mock.callCount(), 1);
    assert.strictEqual(mockDatabaseAdapter.disconnect.mock.callCount(), 1);
  });

  test("should test connection", async () => {
    mockDatabaseAdapter.testConnection.mock.mockImplementation(() =>
      Promise.resolve(true),
    );

    const manager = new MigrationManager();
    const isConnected = await manager.testConnection();

    assert.strictEqual(isConnected, true);
    assert.strictEqual(mockDatabaseAdapter.connect.mock.callCount(), 1);
    assert.strictEqual(mockDatabaseAdapter.testConnection.mock.callCount(), 1);
    assert.strictEqual(mockDatabaseAdapter.disconnect.mock.callCount(), 1);
  });

  test("should handle connection test failure", async () => {
    mockDatabaseAdapter.testConnection.mock.mockImplementation(() =>
      Promise.resolve(false),
    );

    const manager = new MigrationManager();
    const isConnected = await manager.testConnection();

    assert.strictEqual(isConnected, false);
  });

  test("should run migrations with dry run option", async () => {
    const mockFileResults = [
      {
        id: "20231201120000",
        name: "test_migration",
        filename: "20231201120000_test_migration.ts",
        path: "./migrations/20231201120000_test_migration.ts",
        type: "ts" as const,
        timestamp: new Date(),
      },
    ];

    mockFileManager.readMigrationFiles.mock.mockImplementation(() =>
      Promise.resolve(mockFileResults),
    );
    mockDatabaseAdapter.getAppliedMigrations.mock.mockImplementation(() =>
      Promise.resolve([]),
    );

    const manager = new MigrationManager();
    const result = await manager.runMigrations({ dryRun: true });

    assert.ok(result);
    assert.strictEqual(result.success, true);
    // Should not actually execute migrations in dry run
    assert.strictEqual(
      mockDatabaseAdapter.executeMigrationFile.mock.callCount(),
      0,
    );
  });

  test("should run migrations with steps limit", async () => {
    const mockFileResults = [
      {
        id: "20231201120000",
        name: "test_migration_1",
        filename: "20231201120000_test_migration_1.ts",
        path: "./migrations/20231201120000_test_migration_1.ts",
        type: "ts" as const,
        timestamp: new Date(),
      },
      {
        id: "20231201130000",
        name: "test_migration_2",
        filename: "20231201130000_test_migration_2.ts",
        path: "./migrations/20231201130000_test_migration_2.ts",
        type: "ts" as const,
        timestamp: new Date(),
      },
    ];

    mockFileManager.readMigrationFiles.mock.mockImplementation(() =>
      Promise.resolve(mockFileResults),
    );
    mockDatabaseAdapter.getAppliedMigrations.mock.mockImplementation(() =>
      Promise.resolve([]),
    );

    const manager = new MigrationManager();
    const result = await manager.runMigrations({ steps: 1 });

    assert.ok(result);
    assert.strictEqual(result.success, true);
    // Should only run 1 migration due to steps limit
    assert.strictEqual(result.migrations.length, 1);
  });
});
