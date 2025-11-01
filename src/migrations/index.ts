import { readdir, readFile, access } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";
import type { PrismaClient, MigrationsConfig, MigrationFile } from "../types";
import { logger } from "../logger";
import { Discovery } from "../discovery";
import { generateChecksum } from "../utils";
import {
  createMigrationNotFoundError,
  createInvalidMigrationError,
} from "../errors";

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
      `Invalid migration format. Migration file must contain both "${upMarker}" and "${downMarker}" markers.`
    );
  }

  if (upIndex >= downIndex) {
    throw new Error(
      `Invalid migration format. "${upMarker}" must come before "${downMarker}".`
    );
  }

  const upSql = sql
    .substring(upIndex + upMarker.length, downIndex)
    .trim();
  const downSql = sql
    .substring(downIndex + downMarker.length)
    .trim();

  return { up: upSql, down: downSql };
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
      await prisma.$executeRawUnsafe(parsed.up);
    },
    down: async (prisma: PrismaClient) => {
      if (!parsed.down) {
        logger.warn(`No down migration available for: ${migrationPath}`);
        return;
      }
      await prisma.$executeRawUnsafe(parsed.down);
    },
  };
}

export class Migrations {
  private prisma: PrismaClient;
  private migrationsDir?: string;
  private config?: MigrationsConfig;

  constructor(prisma: PrismaClient, config?: MigrationsConfig) {
    this.prisma = prisma;
    this.config = config;
    this.migrationsDir = config?.migrationsDir;
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

  private async executeWithHooks<T>(
    migration: MigrationFile,
    hookType: "up" | "down",
    fn: () => Promise<T>,
  ): Promise<T> {
    const beforeHook =
      hookType === "up"
        ? this.config?.hooks?.beforeUp
        : this.config?.hooks?.beforeDown;
    const afterHook =
      hookType === "up"
        ? this.config?.hooks?.afterUp
        : this.config?.hooks?.afterDown;

    if (beforeHook) {
      await beforeHook(migration);
    }

    const result = await fn();

    if (afterHook) {
      await afterHook(migration);
    }

    return result;
  }

  async dryRun(steps?: number): Promise<MigrationFile[]> {
    const pending = await this.pending();
    return steps ? pending.slice(0, steps) : pending;
  }

  private async getMigrationsDir(): Promise<string> {
    if (this.migrationsDir) {
      logger.debug(`Using cached migrations dir: ${this.migrationsDir}`);
      return this.migrationsDir;
    }

    const discovery = new Discovery();
    this.migrationsDir = await discovery.findMigrationsDir(this.config);
    logger.debug(`Discovered migrations dir: ${this.migrationsDir}`);
    return this.migrationsDir;
  }

  async up(steps?: number) {
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
        logger.info(`Running ${migration.id}_${migration.name}...`);
        try {
          await this.executeWithHooks(migration, "up", async () => {
            const isValid = await this.validateMigrationFile(migration);
            if (!isValid) {
              throw createInvalidMigrationError(
                `${migration.id}_${migration.name}`,
                "missing up or down function",
              );
            }

            const mod = await loadSqlMigration(migration.path);

            const hasUpFunction = typeof mod.up === "function";
            if (!hasUpFunction) {
              throw new Error(
                `Migration ${migration.id}_${migration.name} does not export an 'up' function`,
              );
            }
            await mod.up!(this.prisma);
            const checksum = await generateChecksum(migration.path);
            await this.prisma
              .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, ${checksum}, NOW(), ${migration.name}, NULL, NOW(), 1)`;
            logger.info(`✓ Applied ${migration.id}_${migration.name}`);
          });
        } catch (error) {
          logger.error(
            `Failed to apply migration ${migration.id}_${migration.name}`,
          );
          logger.error(error instanceof Error ? error.message : String(error));
          throw error;
        }
      },
      Promise.resolve(),
    );

    return toRun.length;
  }

  async down(steps: number = 1) {
    const applied = await this.getApplied();
    logger.debug(`Found ${applied.length} applied migrations`);
    const toRollback = applied.slice(-steps);
    logger.debug(`Will rollback ${toRollback.length} migrations`);
    const reversed = toRollback.toReversed();

    await reversed.reduce(async (prev: Promise<void>, id: string) => {
      await prev;
      const migration = await this.findMigration(id);
      if (!migration) {
        throw createMigrationNotFoundError(id);
      }

      logger.info(`Rolling back ${id}_${migration.name}...`);
      try {
        await this.executeWithHooks(migration, "down", async () => {
          const mod = await loadSqlMigration(migration.path);

          const hasDownFunction = typeof mod.down === "function";
          if (!hasDownFunction) {
            throw new Error(
              `Migration ${id}_${migration.name} does not export a 'down' function`,
            );
          }
          await mod.down!(this.prisma);
          await this.prisma
            .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${id}`;
          logger.info(`✓ Rolled back ${id}_${migration.name}`);
        });
      } catch (error) {
        logger.error(`Failed to rollback migration ${id}_${migration.name}`);
        logger.error(error instanceof Error ? error.message : String(error));
        throw error;
      }
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
    const applied = await this.applied();
    logger.debug(`Found ${applied.length} applied migrations to reset`);
    const count = applied.length;
    const reversed = applied.toReversed();

    await reversed.reduce(
      async (prev: Promise<void>, migration: MigrationFile) => {
        await prev;
        logger.info(`Rolling back ${migration.id}_${migration.name}...`);
        try {
          const mod = await loadSqlMigration(migration.path);

          const hasDownFunction = typeof mod.down === "function";
          if (!hasDownFunction) {
            throw new Error(
              `Migration ${migration.id}_${migration.name} does not export a 'down' function`,
            );
          }
          await mod.down!(this.prisma);
          await this.prisma
            .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${migration.id}`;
          logger.info(`✓ Rolled back ${migration.id}_${migration.name}`);
        } catch (error) {
          logger.error(
            `Failed to rollback migration ${migration.id}_${migration.name}`,
          );
          logger.error(error instanceof Error ? error.message : String(error));
          throw error;
        }
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
    const applied = await this.getApplied();
    logger.debug(`Found ${applied.length} applied migrations`);
    const all = await this.getAllMigrations();
    logger.debug(`Found ${all.length} total migrations`);
    const pending = all.filter((m) => !applied.includes(m.id));
    logger.debug(`Found ${pending.length} pending migrations`);

    const targetIndex = pending.findIndex((m) => m.id === migrationId);
    if (targetIndex === -1) {
      throw new Error(
        `Migration ${migrationId} not found in pending migrations`,
      );
    }

    const toRun = pending.slice(0, targetIndex + 1);
    logger.debug(`Will run ${toRun.length} migrations up to ${migrationId}`);

    await toRun.reduce(
      async (prev: Promise<void>, migration: MigrationFile) => {
        await prev;
        logger.info(`Running ${migration.id}_${migration.name}...`);
        try {
          await this.executeWithHooks(migration, "up", async () => {
            const isValid = await this.validateMigrationFile(migration);
            if (!isValid) {
              throw createInvalidMigrationError(
                `${migration.id}_${migration.name}`,
                "missing up or down function",
              );
            }

            const mod = await loadSqlMigration(migration.path);

            const hasUpFunction = typeof mod.up === "function";
            if (!hasUpFunction) {
              throw new Error(
                `Migration ${migration.id}_${migration.name} does not export an 'up' function`,
              );
            }
            await mod.up!(this.prisma);
            const checksum = await generateChecksum(migration.path);
            await this.prisma
              .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, ${checksum}, NOW(), ${migration.name}, NULL, NOW(), 1)`;
            logger.info(`✓ Applied ${migration.id}_${migration.name}`);
          });
        } catch (error) {
          logger.error(
            `Failed to apply migration ${migration.id}_${migration.name}`,
          );
          logger.error(error instanceof Error ? error.message : String(error));
          throw error;
        }
      },
      Promise.resolve(),
    );

    return toRun.length;
  }

  async downTo(migrationId: string): Promise<number> {
    const appliedIds = await this.getApplied();
    logger.debug(`Found ${appliedIds.length} applied migrations`);

    const targetIndex = appliedIds.indexOf(migrationId);
    if (targetIndex === -1) {
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
      if (!migration) {
        throw createMigrationNotFoundError(id);
      }

      logger.info(`Rolling back ${id}_${migration.name}...`);
      try {
        await this.executeWithHooks(migration, "down", async () => {
          const mod = await loadSqlMigration(migration.path);

          const hasDownFunction = typeof mod.down === "function";
          if (!hasDownFunction) {
            throw new Error(
              `Migration ${id}_${migration.name} does not export a 'down' function`,
            );
          }
          await mod.down!(this.prisma);
          await this.prisma
            .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${id}`;
          logger.info(`✓ Rolled back ${id}_${migration.name}`);
        });
      } catch (error) {
        logger.error(`Failed to rollback migration ${id}_${migration.name}`);
        logger.error(error instanceof Error ? error.message : String(error));
        throw error;
      }
    }, Promise.resolve());

    return toRollback.length;
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
      throw new Error(
        `No migration.sql file found in ${dirName}`,
      );
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
        const path = await this.detectMigrationFile(
          migrationsDir,
          entry.name,
        );
        logger.debug(
          `Mapped migration: ${id}_${name} at ${path}`,
        );
        return { id, name, path };
      }),
    );
  }

  private async getAllMigrations(): Promise<MigrationFile[]> {
    const migrationsDir = await this.getMigrationsDir();
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
