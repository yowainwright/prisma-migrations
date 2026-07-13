import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { Migrations } from "../../src/migrations";

let prisma: PrismaClient;
let migrations: Migrations;
let testDirectory: string;

async function dropTestTables(): Promise<void> {
  await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS provider_widgets");
  await prisma.$executeRawUnsafe(
    "DROP TABLE IF EXISTS _prisma_migrations_lock_v2",
  );
  await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS _prisma_migrations");
}

beforeAll(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), "prisma-provider-"));
  const migrationDirectory = join(testDirectory, "001_create_widgets");
  await mkdir(migrationDirectory, { recursive: true });
  await writeFile(
    join(migrationDirectory, "migration.sql"),
    "CREATE TABLE provider_widgets (id INTEGER PRIMARY KEY, name VARCHAR(50));",
  );
  await writeFile(
    join(migrationDirectory, "down.sql"),
    "DROP TABLE provider_widgets;",
  );
  prisma = new PrismaClient();
  await dropTestTables();
  migrations = new Migrations(prisma, { migrationsDir: testDirectory });
});

afterAll(async () => {
  await dropTestTables();
  await prisma.$disconnect();
  await rm(testDirectory, { recursive: true, force: true });
});

describe("provider compatibility", () => {
  test("bootstraps history and applies a migration", async () => {
    await expect(migrations.up()).resolves.toBe(1);

    const statuses = await migrations.status();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].applied).toBe(true);
  });

  test("runs down.sql and retains rollback history", async () => {
    await expect(migrations.down()).resolves.toBe(1);

    const rows = await prisma.$queryRawUnsafe<
      Array<{ rolled_back_at: unknown }>
    >("SELECT rolled_back_at FROM _prisma_migrations");
    expect(rows).toHaveLength(1);
    expect(rows[0].rolled_back_at).not.toBeNull();
  });
});
