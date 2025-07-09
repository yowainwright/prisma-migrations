import { test, describe, mock } from "node:test";
import assert from "node:assert";
import { DatabaseAdapter } from "../src/database-adapter";

// Mock PrismaClient
const mockPrismaClient = {
  $connect: mock.fn(),
  $disconnect: mock.fn(),
  $executeRawUnsafe: mock.fn(),
  $queryRawUnsafe: mock.fn(),
  $queryRaw: mock.fn(),
  $transaction: mock.fn(),
};

// Mock @prisma/client module
mock.module("@prisma/client", () => ({
  PrismaClient: function () {
    return mockPrismaClient;
  },
}));

describe("DatabaseAdapter", () => {
  const testDatabaseUrl = "postgresql://test:test@localhost:5432/test";

  test("should create adapter with default table name", () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    assert.ok(adapter);
  });

  test("should create adapter with custom table name", () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl, "custom_migrations");
    assert.ok(adapter);
  });

  test("should connect to database", async () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    await adapter.connect();

    assert.strictEqual(mockPrismaClient.$connect.mock.callCount(), 1);
  });

  test("should disconnect from database", async () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    await adapter.disconnect();

    assert.strictEqual(mockPrismaClient.$disconnect.mock.callCount(), 1);
  });

  test("should create migrations table", async () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    await adapter.ensureMigrationsTable();

    assert.strictEqual(mockPrismaClient.$executeRawUnsafe.mock.callCount(), 1);
    const call = mockPrismaClient.$executeRawUnsafe.mock.calls[0];
    assert.match(call.arguments[0], /CREATE TABLE IF NOT EXISTS/);
  });

  test("should get applied migrations", async () => {
    const mockResults = [
      { id: "20231201120000", name: "test_migration", appliedAt: new Date() },
    ];

    mockPrismaClient.$queryRawUnsafe.mock.mockImplementation(() =>
      Promise.resolve(mockResults),
    );

    const adapter = new DatabaseAdapter(testDatabaseUrl);
    const migrations = await adapter.getAppliedMigrations();

    assert.strictEqual(migrations.length, 1);
    assert.strictEqual(migrations[0].id, "20231201120000");
    assert.strictEqual(migrations[0].name, "test_migration");
    assert.strictEqual(migrations[0].applied, true);
  });

  test("should check if migration is applied", async () => {
    mockPrismaClient.$queryRawUnsafe.mock.mockImplementation(() =>
      Promise.resolve([{ count: 1 }]),
    );

    const adapter = new DatabaseAdapter(testDatabaseUrl);
    const isApplied = await adapter.isMigrationApplied("20231201120000");

    assert.strictEqual(isApplied, true);
  });

  test("should record migration", async () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    await adapter.recordMigration("20231201120000", "test_migration");

    assert.strictEqual(mockPrismaClient.$executeRawUnsafe.mock.callCount(), 1);
    const call = mockPrismaClient.$executeRawUnsafe.mock.calls[0];
    assert.match(call.arguments[0], /INSERT INTO/);
  });

  test("should remove migration", async () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    await adapter.removeMigration("20231201120000");

    assert.strictEqual(mockPrismaClient.$executeRawUnsafe.mock.callCount(), 1);
    const call = mockPrismaClient.$executeRawUnsafe.mock.calls[0];
    assert.match(call.arguments[0], /DELETE FROM/);
  });

  test("should execute migration SQL", async () => {
    const adapter = new DatabaseAdapter(testDatabaseUrl);
    const sql = "CREATE TABLE test (id SERIAL PRIMARY KEY);";

    await adapter.executeMigration(sql);

    assert.strictEqual(mockPrismaClient.$executeRawUnsafe.mock.callCount(), 1);
  });

  test("should test connection", async () => {
    mockPrismaClient.$queryRaw.mock.mockImplementation(() =>
      Promise.resolve([{ "?column?": 1 }]),
    );

    const adapter = new DatabaseAdapter(testDatabaseUrl);
    const isConnected = await adapter.testConnection();

    assert.strictEqual(isConnected, true);
  });

  test("should handle connection test failure", async () => {
    mockPrismaClient.$queryRaw.mock.mockImplementation(() =>
      Promise.reject(new Error("Connection failed")),
    );

    const adapter = new DatabaseAdapter(testDatabaseUrl);
    const isConnected = await adapter.testConnection();

    assert.strictEqual(isConnected, false);
  });
});
