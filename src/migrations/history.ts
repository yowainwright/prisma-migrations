import { randomUUID } from "crypto";
import type {
  MigrationFile,
  PrismaClient,
  PrismaMigrationClient,
} from "../types";

export interface AppliedMigrationRow {
  id: string;
  checksum?: string;
  migration_name?: string;
  finished_at?: Date | string | null;
  rolled_back_at?: Date | string | null;
  logs?: string | null;
}

type VoidResult = Promise<void>;
type RowsResult = Promise<AppliedMigrationRow[]>;

export function isAppliedMigration(row: AppliedMigrationRow): boolean {
  const hasFinished = row.finished_at !== null;
  const isNotRolledBack = row.rolled_back_at == null;
  return hasFinished && isNotRolledBack;
}

export function isFailedMigration(row: AppliedMigrationRow): boolean {
  const hasFailed = row.finished_at === null;
  const isUnresolved = row.rolled_back_at == null;
  return hasFailed && isUnresolved;
}

export function parseMigrationDirectoryName(
  name: string | undefined,
): { id: string; name: string } | null {
  if (!name) return null;
  const match = name.match(/^(\d+)_(.+)$/);
  if (!match) return null;
  const id = match[1];
  const migrationName = match[2];
  return { id, name: migrationName };
}

export function getAppliedMigrationId(row: AppliedMigrationRow): string {
  const parsedName = parseMigrationDirectoryName(row.migration_name);
  return parsedName?.id ?? row.id;
}

export function getAppliedMigrationName(row: AppliedMigrationRow): string {
  const parsedName = parseMigrationDirectoryName(row.migration_name);
  if (parsedName) return row.migration_name!;
  const hasSeparateName = /^\d+$/.test(row.id) && Boolean(row.migration_name);
  if (hasSeparateName) return `${row.id}_${row.migration_name}`;
  return row.migration_name ?? row.id;
}

export class MigrationHistory {
  private ensurePromise: VoidResult | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  ensureTable(): VoidResult {
    if (!this.ensurePromise) this.ensurePromise = this.createTable();
    return this.ensurePromise;
  }

  private async createTable(): VoidResult {
    try {
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS _prisma_migrations (
          id VARCHAR(36) NOT NULL PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMP NULL,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT NULL,
          rolled_back_at TIMESTAMP NULL,
          started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        )
      `;
    } catch (error) {
      this.ensurePromise = null;
      throw error;
    }
  }

  async rows(): RowsResult {
    await this.ensureTable();
    return this.prisma.$queryRaw<AppliedMigrationRow[]>`
      SELECT id, checksum, migration_name, finished_at, rolled_back_at, logs
      FROM _prisma_migrations
      ORDER BY started_at ASC
    `;
  }

  async appliedRows(): RowsResult {
    const rows = await this.rows();
    return rows.filter(isAppliedMigration);
  }

  assertNoFailedMigrations(rows: AppliedMigrationRow[]): void {
    const failed = rows.filter(isFailedMigration);
    if (failed.length === 0) return;
    const names = failed.map(getAppliedMigrationName).join(", ");
    throw new Error(`Unresolved failed migrations: ${names}`);
  }

  async recordApplied(
    tx: PrismaMigrationClient,
    migration: MigrationFile,
    checksum: string,
  ): VoidResult {
    const migrationName = `${migration.id}_${migration.name}`;
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO _prisma_migrations
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES
        (${id}, ${checksum}, CURRENT_TIMESTAMP, ${migrationName}, NULL, NULL, CURRENT_TIMESTAMP, 1)
    `;
  }

  async recordRolledBack(
    tx: PrismaMigrationClient,
    migration: MigrationFile,
  ): VoidResult {
    const migrationName = `${migration.id}_${migration.name}`;
    await tx.$executeRaw`
      UPDATE _prisma_migrations
      SET rolled_back_at = CURRENT_TIMESTAMP
      WHERE (id = ${migration.id} OR migration_name = ${migrationName})
        AND rolled_back_at IS NULL
    `;
  }
}
