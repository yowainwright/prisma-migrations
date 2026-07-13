import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Migrations } from "prisma-migrations";
import { createProviderClient, type ProviderClient } from "./provider-client";

let prisma: ProviderClient;
let migrations: Migrations;
let testDirectory: string;

async function dropTestTables(client: ProviderClient): Promise<void> {
  await client.$executeRawUnsafe("DROP TABLE IF EXISTS provider_widgets");
  await client.$executeRawUnsafe(
    "DROP TABLE IF EXISTS _prisma_migrations_lock_v2",
  );
  await client.$executeRawUnsafe("DROP TABLE IF EXISTS _prisma_migrations");
}

async function createMigrationFiles(directory: string): Promise<void> {
  const migrationDirectory = join(directory, "001_create_widgets");
  const upPath = join(migrationDirectory, "migration.sql");
  const downPath = join(migrationDirectory, "down.sql");
  const upSql =
    "CREATE TABLE provider_widgets (id INTEGER PRIMARY KEY, name VARCHAR(50));";
  const downSql = "DROP TABLE provider_widgets;";
  const options = { recursive: true };
  await mkdir(migrationDirectory, options);
  await writeFile(upPath, upSql);
  await writeFile(downPath, downSql);
}

beforeAll(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), "prisma-provider-"));
  await createMigrationFiles(testDirectory);
  prisma = await createProviderClient();
  await dropTestTables(prisma);
  migrations = new Migrations(prisma, { migrationsDir: testDirectory });
});

afterAll(async () => {
  await dropTestTables(prisma);
  await prisma.$disconnect();
  await rm(testDirectory, { recursive: true, force: true });
});

describe("provider compatibility", () => {
  test("applies and rolls back a migration", async () => {
    await expect(migrations.up()).resolves.toBe(1);

    const statuses = await migrations.status();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].applied).toBe(true);
    await expect(migrations.down()).resolves.toBe(1);

    const rows = await prisma.$queryRawUnsafe<
      Array<{ rolled_back_at: unknown }>
    >("SELECT rolled_back_at FROM _prisma_migrations");
    expect(rows).toHaveLength(1);
    expect(rows[0].rolled_back_at).not.toBeNull();
  });
});
