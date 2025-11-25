import { readdir, readFile, access } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";
import type { PrismaClient, MigrationFile } from "../types";
import { logger } from "../logger";
import { generateChecksum } from "../utils";
import {
  createMigrationNotFoundError,
  createInvalidMigrationError,
  createChecksumMismatchError,
  createTransactionFailedError,
} from "../errors";
import { MigrationLock } from "./locking";

interface ParsedSqlMigration {
  up: string;
  down: string;
}

function parseSqlMigration(sql: string): ParsedSqlMigration {
  const upMarker = "-- Migration: Up";
  const downMarker = "-- Migration: Down";

  const upIndex = sql.indexOf(upMarker);
  const downIndex = sql.indexOf(downMarker);

  if (upIndex === -1 || downIndex === -1) {
    throw new Error(
      `Invalid migration format. Migration file must contain both "${upMarker}" and "${downMarker}" markers.`,
    );
  }

  if (upIndex >= downIndex) {
    throw new Error(
      `Invalid migration format. "${upMarker}" must come before "${downMarker}".`,
    );
  }

  const upSql = sql.substring(upIndex + upMarker.length, downIndex).trim();
  const downSql = sql.substring(downIndex + downMarker.length).trim();

  return { up: upSql, down: downSql };
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

async function loadSqlMigration(migrationPath: string): Promise<{
  up: (prisma: PrismaClient) => Promise<void>;
  down: (prisma: PrismaClient) => Promise<void>;
}> {
  const sql = await readFile(migrationPath, "utf-8");
  const parsed = parseSqlMigration(sql);

  return {
    up: async (prisma: PrismaClient) => {
      if (!parsed.up) {
        throw new Error(`No up migration found in ${migrationPath}`);
      }
      const statements = splitSqlStatements(parsed.up);
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    },
    down: async (prisma: PrismaClient) => {
      if (!parsed.down) {
        logger.warn(`No down migration available for: ${migrationPath}`);
        return;
      }
      const statements = splitSqlStatements(parsed.down);
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    },
  };
}

export class Migrations {
  private prisma: PrismaClient;
  private migrationsDir: string;
  private lock: MigrationLock | null;
  private disableLocking: boolean;
  private skipChecksumValidation: boolean;
  private lockTimeout: number;

  constructor(
    prisma: PrismaClient,
    options?: {
      migrationsDir?: string;
      disableLocking?: boolean;
      skipChecksumValidation?: boolean;
      lockTimeout?: number;
    },
  ) {
    this.prisma = prisma;
    this.migrationsDir = options?.migrationsDir || "./prisma/migrations";
    this.disableLocking = options?.disableLocking ?? false;
    this.skipChecksumValidation = options?.skipChecksumValidation ?? false;
    this.lockTimeout = options?.lockTimeout ?? 30000;
    this.lock = this.disableLocking ? null : new MigrationLock(prisma);
  }

  private async validateMigrationFile(
    migration: MigrationFile,
  ): Promise<boolean> {
    try {
      const mod = await loadSqlMigration(migration.path);
      return typeof mod.up === "function" && typeof mod.down === "function";
    } catch {
      return false;
    }
  }

  private async validateAppliedMigrationChecksums(): Promise<void> {
    const shouldSkipValidation = this.skipChecksumValidation;

    if (shouldSkipValidation) {
      logger.debug("Skipping checksum validation (disabled)");
      return;
    }

    logger.debug("Validating checksums for applied migrations...");

    const appliedMigrations = await this.prisma.$queryRaw<
      Array<{ id: string; checksum: string; migration_name: string }>
    >`
      SELECT id, checksum, migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at ASC
    `;

    const allMigrations = await this.getAllMigrations();

    await appliedMigrations.reduce(
      async (prev: Promise<void>, applied) => {
        await prev;

        const migrationFile = allMigrations.find((m) => m.id === applied.id);

        if (!migrationFile) {
          logger.warn(
            `Applied migration ${applied.id}_${applied.migration_name} not found in migrations directory`,
          );
          return;
        }

        const currentChecksum = await generateChecksum(migrationFile.path);

        if (currentChecksum !== applied.checksum) {
          throw createChecksumMismatchError(
            `${applied.id}_${applied.migration_name}`,
          );
        }
      },
      Promise.resolve(),
    );

    logger.debug(
      `Validated ${appliedMigrations.length} applied migration checksums`,
    );
  }

  async dryRun(steps?: number): Promise<MigrationFile[]> {
    const pending = await this.pending();
    return steps ? pending.slice(0, steps) : pending;
  }

  private getMigrationsDir(): string {
    logger.debug(`Using migrations dir: ${this.migrationsDir}`);
    return this.migrationsDir;
  }

  async up(steps?: number) {
    const shouldUseLocking = !this.disableLocking;

    if (shouldUseLocking) {
      return await this.lock!.withLock(
        () => this.runUpMigrations(steps),
        this.lockTimeout,
      );
    }

    return await this.runUpMigrations(steps);
  }

  private async runUpMigrations(steps?: number): Promise<number> {
    await this.validateAppliedMigrationChecksums();

    const applied = await this.getApplied();
    logger.debug(`Found ${applied.length} applied migrations`);
    const all = await this.getAllMigrations();
    logger.debug(`Found ${all.length} total migrations`);
    const pending = all.filter((m) => !applied.includes(m.id));
    logger.debug(`Found ${pending.length} pending migrations`);

    let toRun = pending;
    if (steps) toRun = pending.slice(0, steps);
    logger.debug(`Will run ${toRun.length} migrations`);

    await toRun.reduce(
      async (prev: Promise<void>, migration: MigrationFile) => {
        await prev;
        await this.runMigrationInTransaction(migration, "up");
      },
      Promise.resolve(),
    );

    return toRun.length;
  }

  private async runMigrationInTransaction(
    migration: MigrationFile,
    direction: "up" | "down",
  ): Promise<void> {
    const migrationName = `${migration.id}_${migration.name}`;
    const isUpMigration = direction === "up";
    logger.info(`Running ${migrationName}...`);

    try {
      const isValid = await this.validateMigrationFile(migration);
      const isInvalidMigration = !isValid;

      if (isInvalidMigration) {
        throw createInvalidMigrationError(
          migrationName,
          "missing up or down function",
        );
      }

      const mod = await loadSqlMigration(migration.path);
      const migrationFn = isUpMigration ? mod.up : mod.down;
      const isMissingMigrationFunction = typeof migrationFn !== "function";

      if (isMissingMigrationFunction) {
        throw new Error(
          `Migration ${migrationName} does not export a '${direction}' function`,
        );
      }

      await this.prisma.$executeRaw`BEGIN`;

      try {
        await migrationFn(this.prisma);

        if (isUpMigration) {
          const checksum = await generateChecksum(migration.path);
          await this.prisma
            .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, ${checksum}, NOW(), ${migration.name}, NULL, NOW(), 1)`;
        } else {
          await this.prisma
            .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${migration.id}`;
        }

        await this.prisma.$executeRaw`COMMIT`;

        const action = isUpMigration ? "Applied" : "Rolled back";
        logger.info(`✓ ${action} ${migrationName}`);
      } catch (error) {
        await this.prisma.$executeRaw`ROLLBACK`;
        const migrationError =
          error instanceof Error ? error : new Error(String(error));
        throw createTransactionFailedError(migrationName, migrationError);
      }
    } catch (error) {
      const action = isUpMigration ? "apply" : "rollback";
      logger.error(`Failed to ${action} migration ${migrationName}`);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(errorMessage);
      throw error;
    }
  }

  async down(steps: number = 1) {
    const shouldUseLocking = !this.disableLocking;

    if (shouldUseLocking) {
      return await this.lock!.withLock(
        () => this.runDownMigrations(steps),
        this.lockTimeout,
      );
    }

    return await this.runDownMigrations(steps);
  }

  private async runDownMigrations(steps: number): Promise<number> {
    const applied = await this.getApplied();
    logger.debug(`Found ${applied.length} applied migrations`);
    const toRollback = applied.slice(-steps);
    logger.debug(`Will rollback ${toRollback.length} migrations`);
    const reversed = toRollback.toReversed();

    await reversed.reduce(async (prev: Promise<void>, id: string) => {
      await prev;
      const migration = await this.findMigration(id);
      const migrationNotFound = !migration;

      if (migrationNotFound) {
        throw createMigrationNotFoundError(id);
      }

      await this.runMigrationInTransaction(migration, "down");
    }, Promise.resolve());

    return toRollback.length;
  }

  async status() {
    const applied = await this.getApplied();
    const all = await this.getAllMigrations();

    logger.info("\nMigration Status:\n");
    for (const migration of all) {
      const status = applied.includes(migration.id) ? "[x]" : "[ ]";
      logger.info(`${status} ${migration.id}_${migration.name}`);
    }
  }

  async pending(): Promise<MigrationFile[]> {
    const applied = await this.getApplied();
    const all = await this.getAllMigrations();
    return all.filter((m) => !applied.includes(m.id));
  }

  async applied(): Promise<MigrationFile[]> {
    const appliedIds = await this.getApplied();
    const all = await this.getAllMigrations();
    return all.filter((m) => appliedIds.includes(m.id));
  }

  async latest(): Promise<MigrationFile | null> {
    const applied = await this.applied();
    return applied.length > 0 ? applied[applied.length - 1] : null;
  }

  async reset(): Promise<number> {
    const shouldUseLocking = !this.disableLocking;

    if (shouldUseLocking) {
      return await this.lock!.withLock(
        () => this.runResetMigrations(),
        this.lockTimeout,
      );
    }

    return await this.runResetMigrations();
  }

  private async runResetMigrations(): Promise<number> {
    const applied = await this.applied();
    logger.debug(`Found ${applied.length} applied migrations to reset`);
    const count = applied.length;
    const reversed = applied.toReversed();

    await reversed.reduce(
      async (prev: Promise<void>, migration: MigrationFile) => {
        await prev;
        await this.runMigrationInTransaction(migration, "down");
      },
      Promise.resolve(),
    );

    return count;
  }

  async fresh(): Promise<number> {
    await this.reset();
    return await this.up();
  }

  async refresh(): Promise<{ down: number; up: number }> {
    const down = await this.reset();
    const up = await this.up();
    return { down, up };
  }

  async upTo(migrationId: string): Promise<number> {
    const shouldUseLocking = !this.disableLocking;

    if (shouldUseLocking) {
      return await this.lock!.withLock(
        () => this.runUpToMigration(migrationId),
        this.lockTimeout,
      );
    }

    return await this.runUpToMigration(migrationId);
  }

  private async runUpToMigration(migrationId: string): Promise<number> {
    await this.validateAppliedMigrationChecksums();

    const applied = await this.getApplied();
    logger.debug(`Found ${applied.length} applied migrations`);
    const all = await this.getAllMigrations();
    logger.debug(`Found ${all.length} total migrations`);
    const pending = all.filter((m) => !applied.includes(m.id));
    logger.debug(`Found ${pending.length} pending migrations`);

    const targetIndex = pending.findIndex((m) => m.id === migrationId);
    const migrationNotFound = targetIndex === -1;

    if (migrationNotFound) {
      throw new Error(
        `Migration ${migrationId} not found in pending migrations`,
      );
    }

    const toRun = pending.slice(0, targetIndex + 1);
    logger.debug(`Will run ${toRun.length} migrations up to ${migrationId}`);

    await toRun.reduce(
      async (prev: Promise<void>, migration: MigrationFile) => {
        await prev;
        await this.runMigrationInTransaction(migration, "up");
      },
      Promise.resolve(),
    );

    return toRun.length;
  }

  async downTo(migrationId: string): Promise<number> {
    const shouldUseLocking = !this.disableLocking;

    if (shouldUseLocking) {
      return await this.lock!.withLock(
        () => this.runDownToMigration(migrationId),
        this.lockTimeout,
      );
    }

    return await this.runDownToMigration(migrationId);
  }

  private async runDownToMigration(migrationId: string): Promise<number> {
    const appliedIds = await this.getApplied();
    logger.debug(`Found ${appliedIds.length} applied migrations`);

    const targetIndex = appliedIds.indexOf(migrationId);
    const migrationNotFound = targetIndex === -1;

    if (migrationNotFound) {
      throw new Error(
        `Migration ${migrationId} not found in applied migrations`,
      );
    }

    const toRollback = appliedIds.slice(targetIndex + 1);
    logger.debug(
      `Will rollback ${toRollback.length} migrations down to ${migrationId}`,
    );
    const reversed = toRollback.toReversed();

    await reversed.reduce(async (prev: Promise<void>, id: string) => {
      await prev;
      const migration = await this.findMigration(id);
      const migrationNotFound = !migration;

      if (migrationNotFound) {
        throw createMigrationNotFoundError(id);
      }

      await this.runMigrationInTransaction(migration, "down");
    }, Promise.resolve());

    return toRollback.length;
  }

  async upIfNotLocked(steps?: number): Promise<{
    ran: boolean;
    count: number;
    reason?: string;
  }> {
    const lockingDisabled = this.disableLocking;

    if (lockingDisabled) {
      const count = await this.runUpMigrations(steps);
      return { ran: true, count };
    }

    const result = await this.lock!.tryLock(() => this.runUpMigrations(steps));

    if (!result.acquired) {
      logger.info("Another instance is running migrations, skipping");
      return {
        ran: false,
        count: 0,
        reason: "Another instance is running migrations",
      };
    }

    return { ran: true, count: result.result ?? 0 };
  }

  async checkLockStatus(): Promise<boolean> {
    const hasLock = !this.lock;

    if (hasLock) {
      logger.warn("Locking is disabled");
      return false;
    }

    return await this.lock!.isLocked();
  }

  async releaseLock(): Promise<void> {
    const hasNoLock = !this.lock;

    if (hasNoLock) {
      logger.warn("Locking is disabled, no lock to release");
      return;
    }

    await this.lock!.forceRelease();
  }

  private async getApplied(): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at ASC
    `;
    return result.map((r) => r.id);
  }

  private async detectMigrationFile(
    migrationsDir: string,
    dirName: string,
  ): Promise<string> {
    const sqlPath = join(migrationsDir, dirName, "migration.sql");

    const hasSqlFile = await access(sqlPath)
      .then(() => true)
      .catch(() => false);

    if (!hasSqlFile) {
      throw new Error(`No migration.sql file found in ${dirName}`);
    }

    return sqlPath;
  }

  private isValidMigrationDir(name: string): boolean {
    return /^(\d+)_(.+)$/.test(name);
  }

  private parseMigrationName(name: string): { id: string; name: string } {
    const match = name.match(/^(\d+)_(.+)$/);
    if (!match) throw new Error(`Invalid migration name: ${name}`);
    const [, id, migrationName] = match;
    return { id, name: migrationName };
  }

  private filterValidDirectories(entries: Dirent[]) {
    return entries.filter((entry) => {
      const isDirectory = entry.isDirectory();
      const isValid = isDirectory && this.isValidMigrationDir(entry.name);
      logger.debug(
        `Entry ${entry.name}: directory=${isDirectory}, valid=${isValid}`,
      );
      return isValid;
    });
  }

  private async mapToMigrationFiles(
    migrationsDir: string,
    validDirs: Dirent[],
  ): Promise<MigrationFile[]> {
    return await Promise.all(
      validDirs.map(async (entry) => {
        const { id, name } = this.parseMigrationName(entry.name);
        const path = await this.detectMigrationFile(migrationsDir, entry.name);
        logger.debug(`Mapped migration: ${id}_${name} at ${path}`);
        return { id, name, path };
      }),
    );
  }

  private async getAllMigrations(): Promise<MigrationFile[]> {
    const migrationsDir = this.getMigrationsDir();
    logger.debug(`Reading migrations from: ${migrationsDir}`);

    const entries = await readdir(migrationsDir, { withFileTypes: true });
    logger.debug(`Found ${entries.length} entries in migrations directory`);

    const validDirs = this.filterValidDirectories(entries);
    const migrations = await this.mapToMigrationFiles(migrationsDir, validDirs);
    const sorted = migrations.sort((a, b) => a.id.localeCompare(b.id));

    logger.debug(`Loaded ${sorted.length} valid migrations`);
    return sorted;
  }

  private async findMigration(id: string): Promise<MigrationFile | null> {
    const all = await this.getAllMigrations();
    return all.find((m) => m.id === id) || null;
  }
}
