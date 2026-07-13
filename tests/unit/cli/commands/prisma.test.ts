import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { assertNativeDeployCompatible } from "../../../../src/cli/commands/prisma";

const directories: string[] = [];

async function createMigration(migrationSql: string, downSql?: string) {
  const root = await mkdtemp(join(tmpdir(), "prisma-wrapper-"));
  const migrationsDir = join(root, "prisma", "migrations");
  const migrationDir = join(migrationsDir, "20240101000000_test");
  directories.push(root);
  await mkdir(migrationDir, { recursive: true });
  await writeFile(join(migrationDir, "migration.sql"), migrationSql);
  if (downSql) await writeFile(join(migrationDir, "down.sql"), downSql);
  return migrationsDir;
}

afterEach(async () => {
  const removals = directories.splice(0).map((directory) => {
    return rm(directory, { recursive: true, force: true });
  });
  await Promise.all(removals);
});

describe("assertNativeDeployCompatible", () => {
  test("rejects legacy combined migration files", async () => {
    const migrationsDir = await createMigration(
      "-- Migration: Up\nCREATE TABLE users(id INT);\n" +
        "-- Migration: Down\nDROP TABLE users;",
    );

    await expect(assertNativeDeployCompatible(migrationsDir)).rejects.toThrow(
      "legacy combined migration",
    );
  });

  test("accepts migration.sql with a separate down.sql", async () => {
    const migrationsDir = await createMigration(
      "CREATE TABLE users(id INT);",
      "DROP TABLE users;",
    );

    await expect(
      assertNativeDeployCompatible(migrationsDir),
    ).resolves.toBeUndefined();
  });
});
