import { describe, expect, mock, test } from "bun:test";
import {
  getAppliedMigrationId,
  getAppliedMigrationName,
  isAppliedMigration,
  isFailedMigration,
  MigrationHistory,
  parseMigrationDirectoryName,
} from "../../../src/migrations/history";
import type { PrismaClient } from "../../../src/types";

function createClient(executeRaw = mock(() => Promise.resolve(0))) {
  const client: PrismaClient = {
    $executeRaw: executeRaw,
    $executeRawUnsafe: mock(() => Promise.resolve(0)),
    $queryRaw: mock(() => Promise.resolve([])),
    $transaction: mock((operation) => operation(client)),
    $disconnect: mock(() => Promise.resolve()),
  };
  return client;
}

describe("migration history rows", () => {
  test("classifies applied migrations", () => {
    const applied = { id: "001", finished_at: new Date() };
    const rolledBack = { ...applied, rolled_back_at: new Date() };

    expect(isAppliedMigration(applied)).toBe(true);
    expect(isAppliedMigration(rolledBack)).toBe(false);
  });

  test("classifies failed migrations", () => {
    const failed = { id: "001", finished_at: null };
    const resolved = { ...failed, rolled_back_at: new Date() };

    expect(isFailedMigration(failed)).toBe(true);
    expect(isFailedMigration(resolved)).toBe(false);
  });

  test("parses Prisma migration directory names", () => {
    const parsed = parseMigrationDirectoryName("001_create_users");

    expect(parsed).toEqual({ id: "001", name: "create_users" });
    expect(parseMigrationDirectoryName("invalid")).toBeNull();
    expect(parseMigrationDirectoryName(undefined)).toBeNull();
  });

  test("normalizes migration identifiers", () => {
    const prismaRow = { id: "uuid", migration_name: "001_create_users" };

    expect(getAppliedMigrationId(prismaRow)).toBe("001");
    expect(getAppliedMigrationId({ id: "002" })).toBe("002");
  });

  test("normalizes migration names", () => {
    const prismaRow = { id: "uuid", migration_name: "001_create_users" };
    const legacyRow = { id: "002", migration_name: "add_posts" };

    expect(getAppliedMigrationName(prismaRow)).toBe("001_create_users");
    expect(getAppliedMigrationName(legacyRow)).toBe("002_add_posts");
    expect(getAppliedMigrationName({ id: "uuid" })).toBe("uuid");
  });
});

describe("MigrationHistory", () => {
  test("retries table creation after a failure", async () => {
    let attempt = 0;
    const executeRaw = mock(() => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error("database offline"));
      return Promise.resolve(0);
    });
    const history = new MigrationHistory(createClient(executeRaw));

    await expect(history.ensureTable()).rejects.toThrow("database offline");
    await expect(history.ensureTable()).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  test("shares a successful table creation request", async () => {
    const executeRaw = mock(() => Promise.resolve(0));
    const history = new MigrationHistory(createClient(executeRaw));

    await Promise.all([history.ensureTable(), history.ensureTable()]);

    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  test("reports all unresolved failed migrations", () => {
    const history = new MigrationHistory(createClient());
    const failedRows = [
      { id: "001", finished_at: null },
      {
        id: "uuid",
        migration_name: "002_add_posts",
        finished_at: null,
      },
    ];

    expect(() => history.assertNoFailedMigrations(failedRows)).toThrow(
      "Unresolved failed migrations: 001, 002_add_posts",
    );
  });
});
