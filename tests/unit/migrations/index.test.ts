import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { Migrations } from "../../../src/migrations";
import type { PrismaClient, MigrationFile } from "../../../src/types";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "../../../src/logger";

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
      $raw: mock((value: string) => value),
    };

    migrations = new Migrations(mockPrisma, {
      migrationsDir: testMigrationsDir,
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

    test("should throw error when migration format is invalid", async () => {
      const migrationDir = join(testMigrationsDir, "001_missing_markers");
      mkdirSync(migrationDir, { recursive: true });
      writeFileSync(
        join(migrationDir, "migration.sql"),
        `SELECT 1;`,
      );

      await expect(migrations.up()).rejects.toThrow(
        "missing up or down function",
      );
    });
  });

  describe("down", () => {
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

    test("should delete migration records", async () => {
      createMigration("001", "first");

      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await migrations.down(1);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
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
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ id: "001" }]));

      await expect(migrations.downTo("999")).rejects.toThrow(
        "Migration 999 not found in applied migrations",
      );
    });
  });

  describe("getAllMigrations", () => {
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

});
