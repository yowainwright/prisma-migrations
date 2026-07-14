import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  assertNativeDeployCompatible,
  dbPush,
  deploy,
  dev,
  execPrismaCommand,
  generate,
  resolveMigration,
} from "../../../../src/cli/commands/prisma";

const directories: string[] = [];
const originalCwd = process.cwd();

type PrismaBin = string | { prisma: string } | Record<string, never> | null;

const FAKE_PRISMA_CLI_LINES = [
  'const fs = require("fs");',
  "const args = process.argv.slice(2);",
  'fs.writeFileSync("args.json", JSON.stringify(args));',
  'if (args.includes("fail")) process.exitCode = 2;',
];
const FAKE_PRISMA_CLI = FAKE_PRISMA_CLI_LINES.join("\n");

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

async function createPrismaInstallation(
  version = "7.8.0",
  bin: PrismaBin = "cli.cjs",
) {
  const root = await mkdtemp(join(tmpdir(), "prisma-installation-"));
  const packageDir = join(root, "node_modules", "prisma");
  directories.push(root);
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(root, "package.json"), "{}");
  const packageJson = JSON.stringify({ version, bin });
  await writeFile(join(packageDir, "package.json"), packageJson);
  await writeFile(join(packageDir, "cli.cjs"), FAKE_PRISMA_CLI);
  return root;
}

async function readCommandArgs(root: string) {
  const path = join(root, "args.json");
  const content = await readFile(path, "utf-8");
  const parsed = JSON.parse(content) as string[];
  return parsed;
}

async function withinDirectory(
  directory: string,
  callback: () => Promise<void>,
) {
  process.chdir(directory);
  try {
    await callback();
  } finally {
    process.chdir(originalCwd);
  }
}

async function expectCommand(root: string, expected: string[]) {
  const actual = await readCommandArgs(root);
  expect(actual).toEqual(expected);
}

afterEach(async () => {
  process.chdir(originalCwd);
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

  test("accepts a missing migrations directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "prisma-wrapper-"));
    const missingDirectory = join(root, "missing");
    directories.push(root);

    const compatibility = assertNativeDeployCompatible(missingDirectory);

    await expect(compatibility).resolves.toBeUndefined();
  });
});

describe("Prisma command wrappers", () => {
  test("passes migrate dev arguments", async () => {
    const root = await createPrismaInstallation();

    await withinDirectory(root, async () => {
      await dev("create_users");
      const namedArgs = ["migrate", "dev", "--name", "create_users"];
      await expectCommand(root, namedArgs);
      await dev();
      await expectCommand(root, ["migrate", "dev"]);
    });
  });

  test("passes migrate resolve arguments", async () => {
    const root = await createPrismaInstallation();

    await withinDirectory(root, async () => {
      await resolveMigration({ applied: "20240101_create_users" });
      const appliedArgs = [
        "migrate",
        "resolve",
        "--applied",
        "20240101_create_users",
      ];
      await expectCommand(root, appliedArgs);
      await resolveMigration({ rolledBack: "20240101_create_users" });
      const rolledBackArgs = [
        "migrate",
        "resolve",
        "--rolled-back",
        "20240101_create_users",
      ];
      await expectCommand(root, rolledBackArgs);
    });
  });

  test("omits unset migrate resolve arguments", async () => {
    const root = await createPrismaInstallation();

    await withinDirectory(root, async () => {
      await resolveMigration({});
      await expectCommand(root, ["migrate", "resolve"]);
    });
  });

  test("runs deploy and generate", async () => {
    const root = await createPrismaInstallation();

    await withinDirectory(root, async () => {
      await deploy();
      await expectCommand(root, ["migrate", "deploy"]);
      await generate();
      await expectCommand(root, ["generate"]);
    });
  });

  test("uses the Prisma 6 skip-generate option", async () => {
    const root = await createPrismaInstallation("6.19.2");

    await withinDirectory(root, async () => {
      await dbPush({ skipGenerate: true });
      const expected = ["db", "push", "--skip-generate"];
      await expectCommand(root, expected);
    });
  });

  test("omits skip-generate for Prisma 7", async () => {
    const bin = { prisma: "cli.cjs" };
    const root = await createPrismaInstallation("7.8.0", bin);

    await withinDirectory(root, async () => {
      await dbPush({ skipGenerate: true });
      await expectCommand(root, ["db", "push"]);
    });
  });

  test("reports non-zero Prisma CLI exits", async () => {
    const root = await createPrismaInstallation();

    await withinDirectory(root, async () => {
      const command = execPrismaCommand("fail");
      await expect(command).rejects.toThrow(
        "Prisma command exited with code 2",
      );
    });
  });

  test("rejects a package without a named CLI binary", async () => {
    const root = await createPrismaInstallation("7.8.0", {});

    await withinDirectory(root, async () => {
      const command = generate();
      await expect(command).rejects.toThrow(
        "Installed Prisma package has no CLI binary",
      );
    });
  });

  test("rejects a non-object Prisma bin declaration", async () => {
    const root = await createPrismaInstallation("7.8.0", null);

    await withinDirectory(root, async () => {
      const command = generate();
      await expect(command).rejects.toThrow(
        "Installed Prisma package has no CLI binary",
      );
    });
  });
});
