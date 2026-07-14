import {
  createInvalidMigrationError,
  createTransactionFailedError,
} from "../errors";
import { logger } from "../logger";
import type { PrismaClient, PrismaMigrationClient } from "../types";
import { generateChecksum } from "../utils";
import type { DiscoveredMigration } from "./discovery";
import { MigrationHistory } from "./history";
import { loadMigrationStatements } from "./sql";

type Direction = "up" | "down";
type VoidResult = Promise<void>;
type StatementsResult = Promise<string[]>;

async function loadStatements(
  migration: DiscoveredMigration,
  direction: Direction,
): StatementsResult {
  try {
    return await loadMigrationStatements(migration, direction);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const migrationName = `${migration.id}_${migration.name}`;
    throw createInvalidMigrationError(migrationName, reason);
  }
}

async function executeStatements(
  tx: PrismaMigrationClient,
  statements: string[],
): VoidResult {
  await statements.reduce(async (previous, statement) => {
    await previous;
    await tx.$executeRawUnsafe(statement);
  }, Promise.resolve());
}

export class MigrationExecutor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly history: MigrationHistory,
  ) {}

  async run(migration: DiscoveredMigration, direction: Direction): VoidResult {
    const statements = await loadStatements(migration, direction);
    const checksum = await generateChecksum(migration.path);
    try {
      await this.runTransaction(migration, direction, statements, checksum);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      const migrationName = `${migration.id}_${migration.name}`;
      throw createTransactionFailedError(migrationName, cause);
    }
  }

  private async runTransaction(
    migration: DiscoveredMigration,
    direction: Direction,
    statements: string[],
    checksum: string,
  ): VoidResult {
    await this.prisma.$transaction(async (tx) => {
      await executeStatements(tx, statements);
      await this.updateHistory(tx, migration, direction, checksum);
    });
    const migrationName = `${migration.id}_${migration.name}`;
    const action = direction === "up" ? "Applied" : "Rolled back";
    logger.info(`${action} ${migrationName}`);
  }

  private updateHistory(
    tx: PrismaMigrationClient,
    migration: DiscoveredMigration,
    direction: Direction,
    checksum: string,
  ): VoidResult {
    if (direction === "up") {
      return this.history.recordApplied(tx, migration, checksum);
    }
    return this.history.recordRolledBack(tx, migration);
  }
}
