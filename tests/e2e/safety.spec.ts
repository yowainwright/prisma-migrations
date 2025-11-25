import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { Migrations } from "../../src/migrations";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

const testDir = join(process.cwd(), "test-safety-migrations");
const prismaSchema = join(testDir, "schema.prisma");

describe("Migration Safety Features", () => {
  let prisma: PrismaClient;
  let migrations: Migrations;

  beforeAll(async () => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    writeFileSync(
      prismaSchema,
      `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model _prisma_migrations {
  id                    String   @id
  checksum              String
  finished_at           DateTime?
  migration_name        String
  logs                  String?
  started_at            DateTime
  applied_steps_count   Int
}
`,
    );

    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/test_prisma_migrations";

    execSync("bunx prisma generate --schema=" + prismaSchema, {
      stdio: "ignore",
    });

    prisma = new PrismaClient();

    await prisma.$executeRaw`DROP TABLE IF EXISTS _prisma_migrations`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS _prisma_migrations_lock`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS posts`;

    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(255) NOT NULL,
      finished_at TIMESTAMP,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      started_at TIMESTAMP NOT NULL,
      applied_steps_count INT NOT NULL
    )`;

    migrations = new Migrations(prisma, {
      migrationsDir: testDir,
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  const createMigration = (
    id: string,
    name: string,
    upSql: string,
    downSql: string,
  ) => {
    const migrationDir = join(testDir, `${id}_${name}`);
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(
      join(migrationDir, "migration.sql"),
      `-- Migration: Up
${upSql}

-- Migration: Down
${downSql}`,
    );
  };

  describe("Transaction Support", () => {
    test("should rollback migration on SQL error", async () => {
      createMigration(
        "001",
        "failing_migration",
        `CREATE TABLE users (id INT PRIMARY KEY);
INSERT INTO users VALUES (1);
INSERT INTO users VALUES (1);`,
        "DROP TABLE users;",
      );

      await expect(migrations.up()).rejects.toThrow();

      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'users'
      `;

      expect(tables.length).toBe(0);

      const applied = await migrations.applied();
      expect(applied.length).toBe(0);
    });

    test("should commit migration on success", async () => {
      createMigration(
        "002",
        "successful_migration",
        "CREATE TABLE users (id INT PRIMARY KEY);",
        "DROP TABLE users;",
      );

      await migrations.up();

      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'users'
      `;

      expect(tables.length).toBe(1);

      const applied = await migrations.applied();
      expect(applied.length).toBe(1);
      expect(applied[0].id).toBe("002");

      await migrations.down();
    });

    test("should rollback down migration on error", async () => {
      createMigration(
        "003",
        "migration_with_bad_down",
        "CREATE TABLE posts (id INT PRIMARY KEY);",
        `DROP TABLE posts;
DROP TABLE nonexistent_table;`,
      );

      await migrations.up();

      const applied = await migrations.applied();
      expect(applied.length).toBe(1);

      await expect(migrations.down()).rejects.toThrow();

      const appliedAfter = await migrations.applied();
      expect(appliedAfter.length).toBe(1);

      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'posts'
      `;
      expect(tables.length).toBe(1);

      await prisma.$executeRaw`DROP TABLE posts`;
      await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE id = '003'`;
    });
  });

  describe("Checksum Validation", () => {
    test("should detect modified migration files", async () => {
      const migrationDir = join(testDir, "004_checksum_test");
      mkdirSync(migrationDir, { recursive: true });
      const migrationFile = join(migrationDir, "migration.sql");

      writeFileSync(
        migrationFile,
        `-- Migration: Up
CREATE TABLE users (id INT PRIMARY KEY);

-- Migration: Down
DROP TABLE users;`,
      );

      await migrations.up();

      writeFileSync(
        migrationFile,
        `-- Migration: Up
CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255));

-- Migration: Down
DROP TABLE users;`,
      );

      await expect(migrations.up()).rejects.toThrow("has been modified");

      await prisma.$executeRaw`DROP TABLE users`;
      await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE id = '004'`;
    });

    test("should allow running new migrations when checksums are valid", async () => {
      createMigration(
        "005",
        "valid_checksum",
        "CREATE TABLE posts (id INT PRIMARY KEY);",
        "DROP TABLE posts;",
      );

      await migrations.up();

      const applied = await migrations.applied();
      expect(applied.some((m) => m.id === "005")).toBe(true);

      await migrations.down();
    });
  });

  describe("Concurrent Migration Protection", () => {
    test("should prevent concurrent migrations with up()", async () => {
      createMigration(
        "006",
        "concurrent_test",
        "CREATE TABLE users (id INT PRIMARY KEY);",
        "DROP TABLE users;",
      );

      const migration1 = migrations.up();
      const migration2 = migrations.up();

      const results = await Promise.allSettled([migration1, migration2]);

      const successCount = results.filter(
        (r) => r.status === "fulfilled",
      ).length;
      const failureCount = results.filter(
        (r) => r.status === "rejected",
      ).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const rejectedResult = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;

      if (rejectedResult) {
        expect(rejectedResult.reason.message).toContain("migration lock");
      }

      const applied = await migrations.applied();
      expect(applied.filter((m) => m.id === "006").length).toBe(1);

      await migrations.down();
    });

    test("should gracefully skip with upIfNotLocked()", async () => {
      createMigration(
        "011",
        "concurrent_skip_test",
        "CREATE TABLE posts (id INT PRIMARY KEY);",
        "DROP TABLE posts;",
      );

      const results = await Promise.all([
        migrations.upIfNotLocked(),
        migrations.upIfNotLocked(),
        migrations.upIfNotLocked(),
      ]);

      const ranCount = results.filter((r) => r.ran).length;
      const skippedCount = results.filter((r) => !r.ran).length;

      expect(ranCount).toBe(1);
      expect(skippedCount).toBe(2);

      const ranResult = results.find((r) => r.ran);
      expect(ranResult?.count).toBe(1);

      const skippedResults = results.filter((r) => !r.ran);
      skippedResults.forEach((result) => {
        expect(result.reason).toBe("Another instance is running migrations");
      });

      const applied = await migrations.applied();
      expect(applied.filter((m) => m.id === "011").length).toBe(1);

      await migrations.down();
    });

    test("should release lock after migration completes", async () => {
      createMigration(
        "007",
        "lock_release_test",
        "CREATE TABLE posts (id INT PRIMARY KEY);",
        "DROP TABLE posts;",
      );

      await migrations.up();

      const applied1 = await migrations.applied();
      expect(applied1.some((m) => m.id === "007")).toBe(true);

      createMigration(
        "008",
        "second_migration",
        "CREATE TABLE users (id INT PRIMARY KEY);",
        "DROP TABLE users;",
      );

      await migrations.up();

      const applied2 = await migrations.applied();
      expect(applied2.some((m) => m.id === "008")).toBe(true);

      await migrations.down(2);
    });

    test("should release lock after migration failure", async () => {
      createMigration(
        "009",
        "failing_migration_lock_test",
        `CREATE TABLE users (id INT PRIMARY KEY);
INSERT INTO users VALUES (1);
INSERT INTO users VALUES (1);`,
        "DROP TABLE users;",
      );

      await expect(migrations.up()).rejects.toThrow();

      createMigration(
        "010",
        "should_work_after_failure",
        "CREATE TABLE posts (id INT PRIMARY KEY);",
        "DROP TABLE posts;",
      );

      await migrations.up();

      const applied = await migrations.applied();
      expect(applied.some((m) => m.id === "010")).toBe(true);

      await migrations.down();
    });
  });

  describe("Lock Management", () => {
    test("should report no lock when none is held", async () => {
      const isLocked = await migrations.checkLockStatus();
      expect(isLocked).toBe(false);
    });

    test("should report lock when held during migration", async () => {
      createMigration(
        "012",
        "lock_status_test",
        "CREATE TABLE users (id INT PRIMARY KEY); SELECT pg_sleep(2);",
        "DROP TABLE users;",
      );

      const migrationPromise = migrations.up();

      await new Promise((resolve) => setTimeout(resolve, 500));

      const isLocked = await migrations.checkLockStatus();
      expect(isLocked).toBe(true);

      await migrationPromise;

      const isLockedAfter = await migrations.checkLockStatus();
      expect(isLockedAfter).toBe(false);

      await migrations.down();
    });

    test("should release lock manually", async () => {
      createMigration(
        "013",
        "manual_lock_release",
        "CREATE TABLE posts (id INT PRIMARY KEY); SELECT pg_sleep(3);",
        "DROP TABLE posts;",
      );

      const migrationPromise = migrations.up();

      await new Promise((resolve) => setTimeout(resolve, 500));

      const isLockedBefore = await migrations.checkLockStatus();
      expect(isLockedBefore).toBe(true);

      await migrations.releaseLock();

      const isLockedAfter = await migrations.checkLockStatus();
      expect(isLockedAfter).toBe(false);

      await expect(migrationPromise).rejects.toThrow();

      await prisma.$executeRaw`DROP TABLE IF EXISTS posts`;
      await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE id = '013'`;
    });
  });

  describe("upIfNotLocked Scenarios", () => {
    test("should run migration when no lock is held", async () => {
      createMigration(
        "014",
        "no_lock_test",
        "CREATE TABLE users (id INT PRIMARY KEY);",
        "DROP TABLE users;",
      );

      const result = await migrations.upIfNotLocked();

      expect(result.ran).toBe(true);
      expect(result.count).toBe(1);
      expect(result.reason).toBeUndefined();

      const applied = await migrations.applied();
      expect(applied.some((m) => m.id === "014")).toBe(true);

      await migrations.down();
    });

    test("should skip when lock is held", async () => {
      createMigration(
        "015",
        "skip_when_locked",
        "CREATE TABLE posts (id INT PRIMARY KEY); SELECT pg_sleep(2);",
        "DROP TABLE posts;",
      );

      const slowMigration = migrations.up();

      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await migrations.upIfNotLocked();

      expect(result.ran).toBe(false);
      expect(result.count).toBe(0);
      expect(result.reason).toBe("Another instance is running migrations");

      await slowMigration;

      const applied = await migrations.applied();
      expect(applied.some((m) => m.id === "015")).toBe(true);

      await migrations.down();
    });

    test("should handle multiple upIfNotLocked calls correctly", async () => {
      createMigration(
        "016",
        "multiple_calls",
        "CREATE TABLE users (id INT PRIMARY KEY);",
        "DROP TABLE users;",
      );

      const results = await Promise.all([
        migrations.upIfNotLocked(),
        migrations.upIfNotLocked(),
        migrations.upIfNotLocked(),
        migrations.upIfNotLocked(),
        migrations.upIfNotLocked(),
      ]);

      const ranResults = results.filter((r) => r.ran);
      const skippedResults = results.filter((r) => !r.ran);

      expect(ranResults.length).toBe(1);
      expect(skippedResults.length).toBe(4);

      expect(ranResults[0].count).toBe(1);

      skippedResults.forEach((result) => {
        expect(result.count).toBe(0);
        expect(result.reason).toBe("Another instance is running migrations");
      });

      const applied = await migrations.applied();
      expect(applied.filter((m) => m.id === "016").length).toBe(1);

      await migrations.down();
    });

    test("should allow subsequent migrations after first completes", async () => {
      createMigration(
        "017",
        "first_migration",
        "CREATE TABLE users (id INT PRIMARY KEY);",
        "DROP TABLE users;",
      );

      const result1 = await migrations.upIfNotLocked();
      expect(result1.ran).toBe(true);
      expect(result1.count).toBe(1);

      createMigration(
        "018",
        "second_migration",
        "CREATE TABLE posts (id INT PRIMARY KEY);",
        "DROP TABLE posts;",
      );

      const result2 = await migrations.upIfNotLocked();
      expect(result2.ran).toBe(true);
      expect(result2.count).toBe(1);

      const applied = await migrations.applied();
      expect(applied.some((m) => m.id === "017")).toBe(true);
      expect(applied.some((m) => m.id === "018")).toBe(true);

      await migrations.down(2);
    });
  });

  describe("Lock Timeout Configuration", () => {
    test("should respect custom lock timeout", async () => {
      const customMigrations = new Migrations(prisma, {
        migrationsDir: testDir,
        lockTimeout: 5000,
      });

      createMigration(
        "019",
        "timeout_test",
        "CREATE TABLE users (id INT PRIMARY KEY); SELECT pg_sleep(8);",
        "DROP TABLE users;",
      );

      const slowMigration = customMigrations.up();

      await new Promise((resolve) => setTimeout(resolve, 500));

      const startTime = Date.now();
      await expect(customMigrations.up()).rejects.toThrow(
        "Failed to acquire migration lock after 5000ms",
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(5000);
      expect(duration).toBeLessThan(7000);

      await customMigrations.releaseLock();

      await expect(slowMigration).rejects.toThrow();

      await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
      await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE id = '019'`;
    });
  });
});
