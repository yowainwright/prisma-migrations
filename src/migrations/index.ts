import { readdir, readFile, access } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import type { PrismaClient, MigrationsConfig, MigrationFile } from "../types";
import { logger } from "../logger";
import { Discovery } from "../discovery";

async function importMigration(migrationPath: string): Promise<{
  up?: (prisma: PrismaClient) => Promise<void>;
  down?: (prisma: PrismaClient) => Promise<void>;
}> {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

  if (isBun) {
    return await import(pathToFileURL(migrationPath).href);
  }

  let tsxModule: { register: () => () => void };
  try {
    tsxModule = await import("tsx/esm/api" as string);
  } catch {
    return await import(pathToFileURL(migrationPath).href);
  }

  const unregister = tsxModule.register();
  const mod = await import(pathToFileURL(migrationPath).href);
  unregister();
  return mod;
}

async function loadSqlMigration(migrationPath: string): Promise<{
  up: (prisma: PrismaClient) => Promise<void>;
  down: (prisma: PrismaClient) => Promise<void>;
}> {
  const sql = await readFile(migrationPath, "utf-8");

  return {
    up: async (prisma: PrismaClient) => {
      await prisma.$executeRawUnsafe(sql);
    },
    down: async () => {
      logger.warn(`No down migration available for SQL file: ${migrationPath}`);
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
          const mod = migration.fileType === "sql"
            ? await loadSqlMigration(migration.path)
            : await importMigration(migration.path);

          const hasUpFunction = typeof mod.up === "function";
          if (!hasUpFunction) {
            throw new Error(
              `Migration ${migration.id}_${migration.name} does not export an 'up' function`,
            );
          }
          await mod.up!(this.prisma);
          await this.prisma
            .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, '', NOW(), ${migration.name}, NULL, NOW(), 1)`;
          logger.info(`✓ Applied ${migration.id}_${migration.name}`);
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
        throw new Error(`Migration file not found for ${id}`);
      }

      logger.info(`Rolling back ${id}_${migration.name}...`);
      try {
        const mod = migration.fileType === "sql"
          ? await loadSqlMigration(migration.path)
          : await importMigration(migration.path);

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
      const status = applied.includes(migration.id) ? "✓" : "✗";
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
          const mod = migration.fileType === "sql"
            ? await loadSqlMigration(migration.path)
            : await importMigration(migration.path);

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
          const mod = migration.fileType === "sql"
            ? await loadSqlMigration(migration.path)
            : await importMigration(migration.path);

          const hasUpFunction = typeof mod.up === "function";
          if (!hasUpFunction) {
            throw new Error(
              `Migration ${migration.id}_${migration.name} does not export an 'up' function`,
            );
          }
          await mod.up!(this.prisma);
          await this.prisma
            .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, '', NOW(), ${migration.name}, NULL, NOW(), 1)`;
          logger.info(`✓ Applied ${migration.id}_${migration.name}`);
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
        throw new Error(`Migration file not found for ${id}`);
      }

      logger.info(`Rolling back ${id}_${migration.name}...`);
      try {
        const mod = migration.fileType === "sql"
          ? await loadSqlMigration(migration.path)
          : await importMigration(migration.path);

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
  ): Promise<{ path: string; fileType: "ts" | "sql" }> {
    const tsPath = join(migrationsDir, dirName, "migration.ts");
    const sqlPath = join(migrationsDir, dirName, "migration.sql");

    const hasTsFile = await access(tsPath).then(() => true).catch(() => false);
    if (hasTsFile) {
      return { path: tsPath, fileType: "ts" };
    }

    const hasSqlFile = await access(sqlPath).then(() => true).catch(() => false);
    if (hasSqlFile) {
      return { path: sqlPath, fileType: "sql" };
    }

    throw new Error(
      `No migration file found for ${dirName} (checked migration.ts and migration.sql)`,
    );
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
      logger.debug(`Entry ${entry.name}: directory=${isDirectory}, valid=${isValid}`);
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
        const { path, fileType } = await this.detectMigrationFile(migrationsDir, entry.name);
        logger.debug(`Mapped migration: ${id}_${name} at ${path} (${fileType})`);
        return { id, name, path, fileType };
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
