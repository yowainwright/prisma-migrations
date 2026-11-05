import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Migrations } from "prisma-migrations";
import { createProviderClient, type ProviderClient } from "./provider-client";

let prisma: ProviderClient;
let migrations: Migrations;
let testDirectory: string;
const usesMysql = process.env.PRISMA_PROVIDER === "mysql";

async function dropTestTables(client: ProviderClient): Promise<void> {
  await client.$executeRawUnsafe("DROP TABLE IF EXISTS provider_widgets");
  await client.$executeRawUnsafe("DROP TABLE IF EXISTS provider_audit");
  if (process.env.PRISMA_PROVIDER === "postgresql") {
    await client.$executeRawUnsafe("DROP FUNCTION IF EXISTS begin()");
  }
  await client.$executeRawUnsafe(
    "DROP TABLE IF EXISTS _prisma_migrations_lock_v2",
  );
  await client.$executeRawUnsafe("DROP TABLE IF EXISTS _prisma_migrations");
}

async function writeMigration(
  directory: string,
  name: string,
  upSql: string,
  downSql: string,
): Promise<void> {
  const migrationDirectory = join(directory, name);
  const upPath = join(migrationDirectory, "migration.sql");
  const downPath = join(migrationDirectory, "down.sql");
  const options = { recursive: true };
  await mkdir(migrationDirectory, options);
  await writeFile(upPath, upSql);
  await writeFile(downPath, downSql);
}

function triggerSql(): string {
  const provider = process.env.PRISMA_PROVIDER;
  if (provider === "postgresql") {
    return `CREATE FUNCTION begin() RETURNS trigger AS $$
      BEGIN INSERT INTO provider_audit VALUES (NEW.id); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER log_widget AFTER INSERT ON provider_widgets
      FOR EACH ROW EXECUTE FUNCTION begin();`;
  }
  if (provider === "sqlite") {
    return `CREATE TRIGGER log_widget AFTER INSERT ON provider_widgets
      BEGIN INSERT INTO provider_audit VALUES (NEW.id); END;`;
  }
  throw new Error(
    "Trigger execution is not supported by Prisma's MySQL prepared statements",
  );
}

function dropTriggerSql(): string {
  if (process.env.PRISMA_PROVIDER === "postgresql") {
    return "DROP TRIGGER log_widget ON provider_widgets; DROP FUNCTION begin(); DROP TABLE provider_audit;";
  }
  return "DROP TRIGGER log_widget; DROP TABLE provider_audit;";
}

beforeAll(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), "prisma-provider-"));
  await writeMigration(
    testDirectory,
    "001_create_widgets",
    "CREATE TABLE provider_widgets (id INTEGER PRIMARY KEY, name VARCHAR(50));",
    "DROP TABLE provider_widgets;",
  );
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

  test.skipIf(!usesMysql)(
    "executes MySQL strings with escaped quotes and semicolons",
    async () => {
      const upSql =
        "INSERT INTO provider_widgets VALUES (1, 'it\\'s; quoted'); INSERT INTO provider_widgets VALUES (2, 'second');";
      await writeMigration(
        testDirectory,
        "002_quoted_strings",
        upSql,
        "DELETE FROM provider_widgets;",
      );

      const applied = await migrations.up();
      expect(applied).toBe(2);
      const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM provider_widgets ORDER BY id",
      );
      expect(rows.map((row) => row.name)).toEqual(["it's; quoted", "second"]);
      await expect(migrations.down(2)).resolves.toBe(2);
    },
  );

  test.skipIf(usesMysql)(
    "executes statements following a trigger and rolls them back",
    async () => {
      const trigger = triggerSql();
      const upSql = `CREATE TABLE provider_audit (id INTEGER);
      ${trigger}
      INSERT INTO provider_widgets VALUES (1, 'widget');
      ALTER TABLE provider_widgets ADD COLUMN flagged INTEGER;`;
      await writeMigration(
        testDirectory,
        "002_log_widgets",
        upSql,
        dropTriggerSql(),
      );

      const applied = await migrations.up();
      expect(applied).toBe(2);
      const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        "SELECT id FROM provider_audit",
      );
      expect(rows).toEqual([{ id: 1 }]);
      await expect(migrations.down(2)).resolves.toBe(2);
    },
  );
});
