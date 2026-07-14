import type { Dirent } from "fs";
import { access, readFile, readdir } from "fs/promises";
import { join } from "path";
import { logger } from "../logger";
import type { MigrationFile } from "../types";

const MIGRATION_DIRECTORY_PATTERN = /^(\d+)_(.+)$/;
const UP_MARKER = "-- Migration: Up";
const DOWN_MARKER = "-- Migration: Down";

export interface DiscoveredMigration extends MigrationFile {
  format: "prisma" | "legacy";
}

type PathResult = Promise<string>;
type FormatResult = Promise<"prisma" | "legacy">;
type OptionalPathResult = Promise<string | undefined>;
type MigrationResult = Promise<DiscoveredMigration>;
type EntriesResult = Promise<Dirent[]>;
type MigrationListResult = Promise<DiscoveredMigration[]>;
type OptionalMigrationResult = Promise<DiscoveredMigration | null>;

function parseDirectoryName(name: string): { id: string; name: string } {
  const match = name.match(MIGRATION_DIRECTORY_PATTERN);
  if (!match) throw new Error(`Invalid migration name: ${name}`);
  const id = match[1];
  const migrationName = match[2];
  return { id, name: migrationName };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function requireMigrationPath(
  migrationsDir: string,
  entryName: string,
): PathResult {
  const path = join(migrationsDir, entryName, "migration.sql");
  const exists = await pathExists(path);
  if (exists) {
    return path;
  }
  const message = `No migration.sql file found in ${entryName}`;
  throw new Error(message);
}

async function detectFormat(path: string): FormatResult {
  const sql = await readFile(path, "utf-8");
  const hasUpMarker = sql.includes(UP_MARKER);
  const hasDownMarker = sql.includes(DOWN_MARKER);
  const isLegacy = hasUpMarker && hasDownMarker;
  if (isLegacy) return "legacy";
  return "prisma";
}

async function detectDownPath(
  migrationsDir: string,
  entryName: string,
): OptionalPathResult {
  const path = join(migrationsDir, entryName, "down.sql");
  const exists = await pathExists(path);
  if (exists) return path;
  return undefined;
}

async function mapMigration(
  migrationsDir: string,
  entry: Dirent,
): MigrationResult {
  const parsedName = parseDirectoryName(entry.name);
  const path = await requireMigrationPath(migrationsDir, entry.name);
  const format = await detectFormat(path);
  const downPath = await detectDownPath(migrationsDir, entry.name);
  const id = parsedName.id;
  const name = parsedName.name;
  return { id, name, path, format, downPath };
}

function getDuplicateId(migrations: DiscoveredMigration[]): string | undefined {
  const ids = migrations.map((migration) => migration.id);
  return ids.find((id, index) => ids.indexOf(id) !== index);
}

function isMigrationDirectory(entry: Dirent): boolean {
  if (!entry.isDirectory()) return false;
  return MIGRATION_DIRECTORY_PATTERN.test(entry.name);
}

async function readEntries(migrationsDir: string): EntriesResult {
  try {
    return await readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    const isMissingDirectory =
      error instanceof Error && "code" in error && error.code === "ENOENT";
    if (isMissingDirectory) return [];
    throw error;
  }
}

export class MigrationRepository {
  constructor(private readonly migrationsDir: string) {}

  async all(): MigrationListResult {
    const entries = await readEntries(this.migrationsDir);
    const validDirectories = entries.filter(isMigrationDirectory);
    const migrations = await Promise.all(
      validDirectories.map((entry) => mapMigration(this.migrationsDir, entry)),
    );
    const sorted = migrations.toSorted((left, right) => {
      return left.id.localeCompare(right.id);
    });
    const duplicateId = getDuplicateId(sorted);
    if (duplicateId) throw new Error(`Duplicate migration ID: ${duplicateId}`);
    logger.debug(
      `Loaded ${sorted.length} migrations from ${this.migrationsDir}`,
    );
    return sorted;
  }

  async find(id: string): OptionalMigrationResult {
    const migrations = await this.all();
    const found = migrations.find((migration) => migration.id === id);
    return found ?? null;
  }
}
