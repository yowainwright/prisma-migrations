import type { PrismaClient } from "../types";
import { logger } from "../logger";

type CountValue = number | bigint | string;

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_STALE_THRESHOLD_MS = 30 * 60 * 1000;

export class MigrationLockError extends Error {
  public readonly isTimeout: boolean;

  constructor(message: string, isTimeout: boolean = false) {
    super(message);
    this.name = "MigrationLockError";
    this.isTimeout = isTimeout;
  }
}

export class MigrationLock {
  private prisma: PrismaClient;
  private lockAcquired: boolean = false;
  private readonly staleLockThresholdMs: number;

  constructor(
    prisma: PrismaClient,
    staleLockThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
  ) {
    this.prisma = prisma;
    this.staleLockThresholdMs = staleLockThresholdMs;
  }

  private async ensureLockTable(): Promise<void> {
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS _prisma_migrations_lock (
        id INTEGER PRIMARY KEY,
        locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
  }

  private async clearStaleLock(): Promise<void> {
    const staleThreshold = new Date(Date.now() - this.staleLockThresholdMs);
    await this.prisma.$executeRaw`
      DELETE FROM _prisma_migrations_lock WHERE id = 1 AND locked_at < ${staleThreshold}
    `;
  }

  async acquire(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
    const startTime = Date.now();

    logger.debug("Attempting to acquire migration lock...");
    await this.ensureLockTable();

    while (Date.now() - startTime < timeoutMs) {
      const acquired = await this.tryAcquire();

      if (acquired) {
        this.lockAcquired = true;
        logger.debug("Migration lock acquired successfully");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      logger.debug("Lock not available, retrying...");
    }

    throw new MigrationLockError(
      `Failed to acquire migration lock after ${timeoutMs}ms. Another migration may be in progress.`,
      true,
    );
  }

  private async tryAcquire(): Promise<boolean> {
    await this.clearStaleLock();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO _prisma_migrations_lock (id) VALUES (1)
      `;
      return true;
    } catch {
      return false;
    }
  }

  async release(): Promise<void> {
    if (!this.lockAcquired) {
      logger.warn("Attempted to release lock that was not acquired");
      return;
    }

    logger.debug("Releasing migration lock...");
    await this.releaseTableLock();
    this.lockAcquired = false;
    logger.debug("Migration lock released");
  }

  private async releaseTableLock(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM _prisma_migrations_lock WHERE id = 1
      `;
    } catch (error) {
      logger.error(`Failed to release migration lock: ${error}`);
      throw error;
    }
  }

  async tryLock<T>(
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    await this.ensureLockTable();
    const acquired = await this.tryAcquire();

    if (!acquired) {
      logger.debug("Lock not available, skipping");
      return { acquired: false };
    }

    this.lockAcquired = true;
    logger.debug("Lock acquired");

    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      await this.release();
    }
  }

  async withLock<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      await this.release();
    }
  }

  async isLocked(): Promise<boolean> {
    try {
      await this.ensureLockTable();
      const staleThreshold = new Date(Date.now() - this.staleLockThresholdMs);
      const result = await this.prisma.$queryRaw<Array<{ count: CountValue }>>`
        SELECT COUNT(*) as count FROM _prisma_migrations_lock WHERE id = 1 AND locked_at >= ${staleThreshold}
      `;
      return Number(result[0]?.count ?? 0) > 0;
    } catch (error) {
      logger.error(`Failed to check migration lock status: ${error}`);
      return false;
    }
  }

  async forceRelease(): Promise<void> {
    logger.warn("Force releasing migration lock...");
    await this.ensureLockTable();
    await this.releaseTableLock();
    this.lockAcquired = false;
    logger.info("Migration lock force released");
  }
}
