import { spawn } from "child_process";
import { createRequire } from "module";
import { readFile, readdir } from "fs/promises";
import { dirname, join, resolve } from "path";
import { colors } from "../../../utils/colors";

const UP_MARKER = "-- Migration: Up";
const DOWN_MARKER = "-- Migration: Down";

interface PrismaInstallation {
  cliPath: string;
  majorVersion: number;
}

type VoidResult = Promise<void>;
type InstallationResult = Promise<PrismaInstallation>;
type PathsResult = Promise<string[]>;
type BooleanResult = Promise<boolean>;

function readPrismaBin(bin: unknown): string {
  if (typeof bin === "string") return bin;
  const isObject = typeof bin === "object" && bin !== null;
  if (!isObject) throw new Error("Installed Prisma package has no CLI binary");
  const bins = bin as Record<string, unknown>;
  if (typeof bins.prisma === "string") return bins.prisma;
  throw new Error("Installed Prisma package has no CLI binary");
}

async function getPrismaInstallation(): InstallationResult {
  const require = createRequire(join(process.cwd(), "package.json"));
  const packagePath = require.resolve("prisma/package.json");
  const content = await readFile(packagePath, "utf-8");
  const packageJson = JSON.parse(content) as Record<string, unknown>;
  const version = String(packageJson.version);
  const majorVersion = Number.parseInt(version.split(".")[0], 10);
  const bin = readPrismaBin(packageJson.bin);
  const cliPath = resolve(dirname(packagePath), bin);
  return { cliPath, majorVersion };
}

function runPrisma(cliPath: string, args: string[]): VoidResult {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: "inherit",
    });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) resolveCommand();
      else rejectCommand(new Error(`Prisma command exited with code ${code}`));
    });
  });
}

async function migrationSqlPaths(migrationsDir: string): PathsResult {
  try {
    const entries = await readdir(migrationsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(migrationsDir, entry.name, "migration.sql"));
  } catch (error) {
    const isMissing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (isMissing) return [];
    throw error;
  }
}

async function isLegacyCombinedMigration(path: string): BooleanResult {
  const sql = await readFile(path, "utf-8");
  return sql.includes(UP_MARKER) && sql.includes(DOWN_MARKER);
}

export async function assertNativeDeployCompatible(
  migrationsDir = "./prisma/migrations",
): VoidResult {
  const directory = resolve(process.cwd(), migrationsDir);
  const paths = await migrationSqlPaths(directory);
  const results = await Promise.all(paths.map(isLegacyCombinedMigration));
  const legacyPaths = paths.filter((_, index) => results[index]);
  if (legacyPaths.length === 0) return;
  const names = legacyPaths.map((path) => dirname(path)).join(", ");
  throw new Error(
    `Native Prisma deploy cannot run legacy combined migration files: ${names}. ` +
      "Move rollback SQL to down.sql and remove the migration markers.",
  );
}

export async function execPrismaCommand(
  command: string,
  args: string[] = [],
): VoidResult {
  const installation = await getPrismaInstallation();
  const commandArgs = [command, ...args];
  console.log(colors.cyan(`\nRunning: prisma ${commandArgs.join(" ")}\n`));
  await runPrisma(installation.cliPath, commandArgs);
}

export async function dev(name?: string): VoidResult {
  const args = ["dev"];
  if (name) args.push("--name", name);
  await execPrismaCommand("migrate", args);
}

export async function deploy(migrationsDir?: string): VoidResult {
  await assertNativeDeployCompatible(migrationsDir);
  await execPrismaCommand("migrate", ["deploy"]);
}

export async function resolveMigration(options: {
  applied?: string;
  rolledBack?: string;
}): VoidResult {
  const args = ["resolve"];
  if (options.applied) args.push("--applied", options.applied);
  if (options.rolledBack) args.push("--rolled-back", options.rolledBack);
  await execPrismaCommand("migrate", args);
}

export { resolveMigration as resolve };

export async function dbPush(
  options: { skipGenerate?: boolean } = {},
): VoidResult {
  const installation = await getPrismaInstallation();
  const args = ["push"];
  const supportsSkipGenerate = installation.majorVersion < 7;
  if (options.skipGenerate && supportsSkipGenerate) args.push("--skip-generate");
  await execPrismaCommand("db", args);
}

export async function generate(): VoidResult {
  await execPrismaCommand("generate", []);
}
