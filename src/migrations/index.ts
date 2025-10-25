import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import type { PrismaClient, MigrationsConfig, MigrationFile } from "../types";
import { logger } from "../logger";
import { Discovery } from "../discovery";

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
        const mod = await import(pathToFileURL(migration.path).href);
        await mod.up(this.prisma);
        await this.prisma
          .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, '', NOW(), ${migration.name}, NULL, NOW(), 1)`;
        logger.info(`✓ Applied ${migration.id}_${migration.name}`);
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
      const mod = await import(pathToFileURL(migration.path).href);
      await mod.down(this.prisma);
      await this.prisma
        .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${id}`;
      logger.info(`✓ Rolled back ${id}_${migration.name}`);
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
        const mod = await import(pathToFileURL(migration.path).href);
        await mod.down(this.prisma);
        await this.prisma
          .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${migration.id}`;
        logger.info(`✓ Rolled back ${migration.id}_${migration.name}`);
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
        const mod = await import(pathToFileURL(migration.path).href);
        await mod.up(this.prisma);
        await this.prisma
          .$executeRaw`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${migration.id}, '', NOW(), ${migration.name}, NULL, NOW(), 1)`;
        logger.info(`✓ Applied ${migration.id}_${migration.name}`);
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
      const mod = await import(pathToFileURL(migration.path).href);
      await mod.down(this.prisma);
      await this.prisma
        .$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${id}`;
      logger.info(`✓ Rolled back ${id}_${migration.name}`);
    }, Promise.resolve());

    return toRollback.length;
  }

  private async getApplied(): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at ASC
    `;
    return result.map((r) => r.id);
  }

  private async getAllMigrations(): Promise<MigrationFile[]> {
    const migrationsDir = await this.getMigrationsDir();
    logger.debug(`Reading migrations from: ${migrationsDir}`);

    const entries = await readdir(migrationsDir, { withFileTypes: true });
    logger.debug(`Found ${entries.length} entries in migrations directory`);

    const migrations = entries
      .filter((entry) => {
        const isDirectory = entry.isDirectory();
        logger.debug(`Entry ${entry.name} is directory: ${isDirectory}`);
        return isDirectory;
      })
      .filter((entry) => {
        const hasValidFormat = entry.name.match(/^(\d+)_(.+)$/) !== null;
        logger.debug(`Entry ${entry.name} matches format: ${hasValidFormat}`);
        return hasValidFormat;
      })
      .map((entry) => {
        const match = entry.name.match(/^(\d+)_(.+)$/);
        const [, id, name] = match!;
        const migrationPath = join(migrationsDir, entry.name, "migration.ts");
        logger.debug(`Mapped migration: ${id}_${name} at ${migrationPath}`);
        return { id, name, path: migrationPath };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    logger.debug(`Loaded ${migrations.length} valid migrations`);
    return migrations;
  }

  private async findMigration(id: string): Promise<MigrationFile | null> {
    const all = await this.getAllMigrations();
    return all.find((m) => m.id === id) || null;
  }
}
