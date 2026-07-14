import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { Migrations } from "../../../src/migrations";
import type { PrismaClient } from "../../../src/types";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { generateChecksum } from "../../../src/utils";

const testMigrationsDir = join(process.cwd(), "test-migrations");

describe("Migrations", () => {
  let mockPrisma: PrismaClient;
  let migrations: Migrations;

  beforeEach(() => {
    if (existsSync(testMigrationsDir)) {
      rmSync(testMigrationsDir, { recursive: true });
    }
    mkdirSync(testMigrationsDir, { recursive: true });

    mockPrisma = {
      $executeRaw: mock(() => Promise.resolve(1)),
      $executeRawUnsafe: mock(() => Promise.resolve(1)),
      $queryRaw: mock(() => Promise.resolve([])),
      $transaction: mock((fn) => fn(mockPrisma)),
      $disconnect: mock(() => Promise.resolve()),
      $raw: mock((value: string) => value),
    };

    migrations = new Migrations(mockPrisma, {
      migrationsDir: testMigrationsDir,
      disableLocking: true,
    });
  });

  afterEach(() => {
    if (existsSync(testMigrationsDir)) {
      rmSync(testMigrationsDir, { recursive: true });
    }
  });

  const createMigration = (
    id: string,
    name: string,
    upSql = "SELECT 1;",
    downSql = "SELECT 1;",
  ) => {
    const migrationDir = join(testMigrationsDir, `${id}_${name}`);
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(
      join(migrationDir, "migration.sql"),
      `-- Migration: Up
${upSql}

-- Migration: Down
${downSql}
`,
    );
  };

  const createPrismaMigration = (
    id: string,
    name: string,
    upSql = "SELECT 1;",
    downSql?: string,
  ) => {
    const migrationDir = join(testMigrationsDir, `${id}_${name}`);
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(join(migrationDir, "migration.sql"), upSql);
    if (downSql !== undefined) {
      writeFileSync(join(migrationDir, "down.sql"), downSql);
    }
  };

  describe("constructor", () => {
    test("should use default migrations directory", () => {
      const m = new Migrations(mockPrisma);
      expect(m).toBeDefined();
    });

    test("should use custom migrations directory from config", () => {
      const m = new Migrations(mockPrisma, {
        migrationsDir: "./custom/migrations",
      });
      expect(m).toBeDefined();
    });
  });

  describe("pending", () => {
    test("should return empty array when no migrations exist", async () => {
      const pending = await migrations.pending();
      expect(Array.isArray(pending)).toBe(true);
      expect(pending.length).toBe(0);
    });

    test("should return all migrations when none applied", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      const pending = await migrations.pending();
      expect(pending.length).toBe(2);
      expect(pending[0].id).toBe("001");
      expect(pending[1].id).toBe("002");
    });

    test("should return only unapplied migrations", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      createMigration("003", "third");

      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([{ id: "001" }, { id: "002" }]),
      );

      const pending = await migrations.pending();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe("003");
    });

    test("should recognize Prisma Migrate migration_name rows", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([
          {
            id: "91c65487-6ea6-4a3b-93c0-d46bdc5bd4c8",
            migration_name: "001_first",
          },
        ]),
      );

      const pending = await migrations.pending();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe("002");
    });

    test("should sort migrations by id", async () => {
      createMigration("003", "third");
      createMigration("001", "first");
      createMigration("002", "second");

      const pending = await migrations.pending();
      expect(pending[0].id).toBe("001");
      expect(pending[1].id).toBe("002");
      expect(pending[2].id).toBe("003");
    });
  });

  describe("applied", () => {
    test("should return empty array when no migrations applied", async () => {
      const applied = await migrations.applied();
      expect(Array.isArray(applied)).toBe(true);
      expect(applied.length).toBe(0);
    });

    test("should return applied migrations", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([{ id: "001" }, { id: "002" }]),
      );

      const applied = await migrations.applied();
      expect(applied.length).toBe(2);
      expect(applied[0].id).toBe("001");
      expect(applied[1].id).toBe("002");
    });
  });

  describe("latest", () => {
    test("should return null when no migrations applied", async () => {
      const latest = await migrations.latest();
      expect(latest).toBeNull();
    });

    test("should return last applied migration", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      createMigration("003", "third");

      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([{ id: "001" }, { id: "002" }, { id: "003" }]),
      );

      const latest = await migrations.latest();
      expect(latest).not.toBeNull();
      expect(latest?.id).toBe("003");
    });
  });

  describe("up", () => {
    test("should run a Prisma migration without marker comments", async () => {
      createPrismaMigration("001", "first", "SELECT 1;");

      const count = await migrations.up();

      expect(count).toBe(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    });

    test("should run all pending migrations", async () => {
      createMigration("001", "first", "SELECT 1;", "SELECT 1;");
      createMigration("002", "second", "SELECT 2;", "SELECT 2;");

      const count = await migrations.up();
      expect(count).toBe(2);
    });

    test("should run limited number of migrations when steps provided", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      createMigration("003", "third");

      const count = await migrations.up(2);
      expect(count).toBe(2);
    });

    test("should insert migration records", async () => {
      createMigration("001", "first");

      await migrations.up();

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    test("should reject zero steps", async () => {
      createMigration("001", "first");

      await expect(migrations.up(0)).rejects.toThrow(
        "steps must be a positive integer",
      );
    });

    test("should not split semicolons inside strings or dollar quotes", async () => {
      createMigration(
        "001",
        "function_body",
        `CREATE FUNCTION test_fn() RETURNS void AS $$
BEGIN
  RAISE NOTICE 'hello; world';
END;
$$ LANGUAGE plpgsql;
SELECT 'done; ok';`,
        "SELECT 1;",
      );

      await migrations.up();

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });
  });

  describe("down", () => {
    test("should execute a separate down.sql file", async () => {
      createPrismaMigration("001", "first", "SELECT 1;", "SELECT 2;");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      const count = await migrations.down();

      expect(count).toBe(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    });

    test("should reject an irreversible migration without changing history", async () => {
      createPrismaMigration("001", "first", "SELECT 1;");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await expect(migrations.down()).rejects.toThrow(
        "does not have executable rollback SQL",
      );
    });

    test("should reject an empty legacy down section", async () => {
      createMigration("001", "first", "SELECT 1;", "-- no rollback");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await expect(migrations.down()).rejects.toThrow(
        "does not have executable rollback SQL",
      );
    });

    test("should rollback specified number of migrations", async () => {
      createMigration(
        "001",
        "first",
        "CREATE TABLE test (id INT);",
        "DROP TABLE test;",
      );

      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      const count = await migrations.down(1);
      expect(count).toBe(1);
    });

    test("should retain rollback history", async () => {
      createMigration("001", "first");

      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await migrations.down(1);

      const queries = mockPrisma.$executeRaw.mock.calls.map(([query]) =>
        String(query),
      );
      expect(
        queries.some((query) =>
          query.includes("SET rolled_back_at = CURRENT_TIMESTAMP"),
        ),
      ).toBe(true);
      expect(
        queries.some((query) =>
          query.includes("DELETE FROM _prisma_migrations WHERE"),
        ),
      ).toBe(false);
    });

    test("should reject zero steps", async () => {
      createMigration("001", "first");

      await expect(migrations.down(0)).rejects.toThrow(
        "steps must be a positive integer",
      );
    });

    test("should throw error if migration file not found", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await expect(migrations.down(1)).rejects.toThrow(
        "Migration file not found for 001",
      );
    });
  });

  describe("reset", () => {
    test("should rollback all migrations", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([{ id: "001" }, { id: "002" }]),
      );

      const count = await migrations.reset();
      expect(count).toBe(2);
    });

    test("should return 0 when no migrations applied", async () => {
      const count = await migrations.reset();
      expect(count).toBe(0);
    });
  });

  describe("fresh", () => {
    test("should reset and re-run all migrations", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      let callCount = 0;
      mockPrisma.$queryRaw = mock(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve([{ id: "001" }, { id: "002" }])
          : Promise.resolve([]);
      });

      const count = await migrations.fresh();
      expect(count).toBe(2);
    });
  });

  describe("refresh", () => {
    test("should return counts for down and up", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      let callCount = 0;
      mockPrisma.$queryRaw = mock(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve([{ id: "001" }, { id: "002" }])
          : Promise.resolve([]);
      });

      const result = await migrations.refresh();
      expect(result.down).toBe(2);
      expect(result.up).toBe(2);
    });
  });

  describe("upTo", () => {
    test("should run migrations up to specified id", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      createMigration("003", "third");

      const count = await migrations.upTo("002");
      expect(count).toBe(2);
    });

    test("should throw error if migration not found", async () => {
      createMigration("001", "first");

      await expect(migrations.upTo("999")).rejects.toThrow(
        "Migration 999 not found in pending migrations",
      );
    });
  });

  describe("downTo", () => {
    test("should rollback migrations down to specified id", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      createMigration("003", "third");

      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([{ id: "001" }, { id: "002" }, { id: "003" }]),
      );

      const count = await migrations.downTo("001");
      expect(count).toBe(2);
    });

    test("should throw error if migration not found", async () => {
      createMigration("001", "first");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await expect(migrations.downTo("999")).rejects.toThrow(
        "Migration 999 not found in applied migrations",
      );
    });
  });

  describe("getAllMigrations", () => {
    test("should reject duplicate migration IDs", async () => {
      createPrismaMigration("001", "first");
      createPrismaMigration("001", "second");

      await expect(migrations.pending()).rejects.toThrow(
        "Duplicate migration ID: 001",
      );
    });

    test("should ignore non-directory entries", async () => {
      createMigration("001", "first");
      writeFileSync(join(testMigrationsDir, "readme.txt"), "test");

      const pending = await migrations.pending();
      expect(pending.length).toBe(1);
    });

    test("should ignore directories with invalid format", async () => {
      createMigration("001", "first");
      const invalidDir = join(testMigrationsDir, "invalid-name");
      mkdirSync(invalidDir);

      const pending = await migrations.pending();
      expect(pending.length).toBe(1);
    });

    test("should parse migration id and name correctly", async () => {
      createMigration("20230101120000", "create_users_table");

      const pending = await migrations.pending();
      expect(pending[0].id).toBe("20230101120000");
      expect(pending[0].name).toBe("create_users_table");
    });
  });
  describe("detectMigrationFile", () => {
    test("should throw error if migration.sql is not found", async () => {
      const emptyMigrationDir = join(testMigrationsDir, "001_empty");
      mkdirSync(emptyMigrationDir, { recursive: true });

      await expect(migrations.pending()).rejects.toThrow(
        "No migration.sql file found in 001_empty",
      );
    });
  });

  describe("upIfNotLocked", () => {
    test("should run migrations when lock is available", async () => {
      createMigration("001", "test");
      createMigration("002", "test2");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([]));

      const result = await migrations.upIfNotLocked();

      expect(result.ran).toBe(true);
      expect(result.count).toBe(2);
      expect(result.reason).toBeUndefined();
    });

    test("should skip when locking is disabled", async () => {
      createMigration("001", "test");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([]));

      const result = await migrations.upIfNotLocked();

      expect(result.ran).toBe(true);
      expect(result.count).toBe(1);
    });

    test("should respect steps parameter", async () => {
      createMigration("001", "test");
      createMigration("002", "test2");
      createMigration("003", "test3");
      mockPrisma.$queryRaw = mock(() => Promise.resolve([]));

      const result = await migrations.upIfNotLocked(2);

      expect(result.ran).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe("checkLockStatus", () => {
    test("should return false when locking is disabled", async () => {
      const result = await migrations.checkLockStatus();
      expect(result).toBe(false);
    });
  });

  describe("releaseLock", () => {
    test("should not throw when locking is disabled", async () => {
      await expect(migrations.releaseLock()).resolves.toBeUndefined();
    });
  });

  describe("constructor options", () => {
    test("should accept lockTimeout option", () => {
      const customMigrations = new Migrations(mockPrisma, {
        migrationsDir: testMigrationsDir,
        disableLocking: true,
        lockTimeout: 60000,
      });

      expect(customMigrations).toBeDefined();
    });

    test("should accept skipChecksumValidation option", () => {
      const customMigrations = new Migrations(mockPrisma, {
        migrationsDir: testMigrationsDir,
        disableLocking: true,
        skipChecksumValidation: true,
      });

      expect(customMigrations).toBeDefined();
    });

    test("should use default values when options not provided", () => {
      const defaultMigrations = new Migrations(mockPrisma);
      expect(defaultMigrations).toBeDefined();
    });
  });

  describe("status", () => {
    test("should return migration status", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      const result = await migrations.status();

      expect(result).toEqual([
        { migration: expect.objectContaining({ id: "001" }), applied: true },
        { migration: expect.objectContaining({ id: "002" }), applied: false },
      ]);
    });

    test("should return empty status when no migrations", async () => {
      await expect(migrations.status()).resolves.toEqual([]);
    });
  });

  describe("history bootstrap", () => {
    test("should create Prisma migration history before applying", async () => {
      createPrismaMigration("001", "first");

      await migrations.up();

      const queries = mockPrisma.$executeRaw.mock.calls.map(([query]) =>
        String(query),
      );
      expect(
        queries.some((query) =>
          query.includes("CREATE TABLE IF NOT EXISTS _prisma_migrations"),
        ),
      ).toBe(true);
    });
  });

  describe("checksum validation", () => {
    test("should not throw when validation passes", async () => {
      createMigration("001", "first");

      await migrations.up();
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    test("should skip validation when skipChecksumValidation is true", async () => {
      const noValidationMigrations = new Migrations(mockPrisma, {
        migrationsDir: testMigrationsDir,
        disableLocking: true,
        skipChecksumValidation: true,
      });

      createMigration("001", "first");

      await noValidationMigrations.up();
    });

    test("should reject a changed applied migration", async () => {
      createMigration("001", "first");
      const rows = [{ id: "001", checksum: "invalid" }];
      mockPrisma.$queryRaw = mock(() => Promise.resolve(rows));

      const result = migrations.up();

      await expect(result).rejects.toThrow(
        "Migration 001 has been modified after being applied",
      );
    });

    test("should accept an unchanged applied migration", async () => {
      createMigration("001", "first");
      const migrationPath = join(
        testMigrationsDir,
        "001_first",
        "migration.sql",
      );
      const checksum = await generateChecksum(migrationPath);
      const rows = [{ id: "001", checksum }];
      mockPrisma.$queryRaw = mock(() => Promise.resolve(rows));

      await expect(migrations.up()).resolves.toBe(0);
    });
  });

  describe("history validation", () => {
    test("should reject unresolved failed migrations", async () => {
      createMigration("001", "first");
      const rows = [
        {
          id: "uuid",
          migration_name: "001_first",
          finished_at: null,
          rolled_back_at: null,
        },
      ];
      mockPrisma.$queryRaw = mock(() => Promise.resolve(rows));

      const result = migrations.pending();

      await expect(result).rejects.toThrow(
        "Unresolved failed migrations: 001_first",
      );
    });

    test("should reject applied migrations missing from disk", async () => {
      createMigration("001", "first");
      const rows = [{ id: "999" }];
      mockPrisma.$queryRaw = mock(() => Promise.resolve(rows));

      const result = migrations.pending();

      await expect(result).rejects.toThrow("Migration file not found for 999");
    });

    test("should reject migrations applied out of order", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      const rows = [{ id: "002" }];
      mockPrisma.$queryRaw = mock(() => Promise.resolve(rows));

      const result = migrations.pending();

      await expect(result).rejects.toThrow(
        "Migration history is out of order: 002 is applied before 001",
      );
    });
  });

  describe("dryRun", () => {
    test("should list pending migrations without running them", async () => {
      createMigration("001", "first");
      createMigration("002", "second");

      const result = await migrations.dryRun();
      expect(result.length).toBe(2);

      const applied = await migrations.applied();
      expect(applied.length).toBe(0);
    });

    test("should respect steps parameter", async () => {
      createMigration("001", "first");
      createMigration("002", "second");
      createMigration("003", "third");

      const result = await migrations.dryRun(2);
      expect(result.length).toBe(2);
    });
  });
});
