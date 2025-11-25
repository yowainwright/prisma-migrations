import type { PrismaClient } from "../types";
import { logger } from "../logger";

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
  private lockId: number;
  private lockAcquired: boolean = false;
  private databaseType: "postgresql" | "mysql" | "sqlite" | "unknown" =
    "unknown";

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    // Use a fixed lock ID for migrations (hash of "prisma-migrations")
    this.lockId = 1836213295;
  }

  private async detectDatabaseType(): Promise<void> {
    if (this.databaseType !== "unknown") {
      return;
    }

    try {
      // Try PostgreSQL version query
      await this.prisma.$queryRaw<Array<{ version: string }>>`
        SELECT version() as version
      `;
      this.databaseType = "postgresql";
      logger.debug("Detected PostgreSQL database");
      return;
    } catch {
      // Not PostgreSQL
    }

    try {
      // Try MySQL version query
      await this.prisma.$queryRaw<Array<{ version: string }>>`
        SELECT VERSION() as version
      `;
      this.databaseType = "mysql";
      logger.debug("Detected MySQL database");
      return;
    } catch {
      // Not MySQL
    }

    // Assume SQLite if neither PostgreSQL nor MySQL
    this.databaseType = "sqlite";
    logger.debug("Detected SQLite database");
  }

  async acquire(timeoutMs: number = 30000): Promise<void> {
    await this.detectDatabaseType();

    const startTime = Date.now();

    logger.debug(
      `Attempting to acquire migration lock (database: ${this.databaseType})...`,
    );

    while (Date.now() - startTime < timeoutMs) {
      const acquired = await this.tryAcquire();

      if (acquired) {
        this.lockAcquired = true;
        logger.debug("Migration lock acquired successfully");
        return;
      }

      // Wait 1 second before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
      logger.debug("Lock not available, retrying...");
    }

    throw new MigrationLockError(
      `Failed to acquire migration lock after ${timeoutMs}ms. Another migration may be in progress.`,
      true,
    );
  }

  private async tryAcquire(): Promise<boolean> {
    switch (this.databaseType) {
      case "postgresql":
        return await this.acquirePostgresLock();
      case "mysql":
        return await this.acquireMySQLLock();
      case "sqlite":
        return await this.acquireSQLiteLock();
      default:
        logger.warn(
          "Unknown database type, skipping lock acquisition (unsafe!)",
        );
        return true;
    }
  }

  private async acquirePostgresLock(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_lock(${this.lockId}) as locked
      `;
      return result[0]?.locked ?? false;
    } catch (error) {
      logger.error(`Failed to acquire PostgreSQL advisory lock: ${error}`);
      return false;
    }
  }

  private async acquireMySQLLock(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ locked: number }>>`
        SELECT GET_LOCK('prisma_migrations_lock', 0) as locked
      `;
      return result[0]?.locked === 1;
    } catch (error) {
      logger.error(`Failed to acquire MySQL lock: ${error}`);
      return false;
    }
  }

  private async acquireSQLiteLock(): Promise<boolean> {
    try {
      // SQLite: Use a table-based lock since it's file-based
      // Try to insert a lock record, will fail if already exists
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS _prisma_migrations_lock (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          locked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await this.prisma.$executeRaw`
        INSERT INTO _prisma_migrations_lock (id) VALUES (1)
      `;
      return true;
    } catch (error) {
      // Lock already exists
      return false;
    }
  }

  async release(): Promise<void> {
    if (!this.lockAcquired) {
      logger.warn("Attempted to release lock that was not acquired");
      return;
    }

    logger.debug("Releasing migration lock...");

    switch (this.databaseType) {
      case "postgresql":
        await this.releasePostgresLock();
        break;
      case "mysql":
        await this.releaseMySQLLock();
        break;
      case "sqlite":
        await this.releaseSQLiteLock();
        break;
      default:
        logger.warn("Unknown database type, skipping lock release");
    }

    this.lockAcquired = false;
    logger.debug("Migration lock released");
  }

  private async releasePostgresLock(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(${this.lockId})
      `;
    } catch (error) {
      logger.error(`Failed to release PostgreSQL advisory lock: ${error}`);
    }
  }

  private async releaseMySQLLock(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT RELEASE_LOCK('prisma_migrations_lock')
      `;
    } catch (error) {
      logger.error(`Failed to release MySQL lock: ${error}`);
    }
  }

  private async releaseSQLiteLock(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM _prisma_migrations_lock WHERE id = 1
      `;
    } catch (error) {
      logger.error(`Failed to release SQLite lock: ${error}`);
    }
  }

  async tryLock<T>(
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    await this.detectDatabaseType();

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
    await this.detectDatabaseType();

    switch (this.databaseType) {
      case "postgresql":
        return await this.isPostgresLocked();
      case "mysql":
        return await this.isMySQLLocked();
      case "sqlite":
        return await this.isSQLiteLocked();
      default:
        return false;
    }
  }

  private async isPostgresLocked(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory'
          AND objid = ${this.lockId}
        ) as locked
      `;
      return result[0]?.locked ?? false;
    } catch (error) {
      logger.error(`Failed to check PostgreSQL lock status: ${error}`);
      return false;
    }
  }

  private async isMySQLLocked(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ locked: number }>>`
        SELECT IS_USED_LOCK('prisma_migrations_lock') as locked
      `;
      const lockStatus = result[0]?.locked;
      return lockStatus !== null && lockStatus !== 0;
    } catch (error) {
      logger.error(`Failed to check MySQL lock status: ${error}`);
      return false;
    }
  }

  private async isSQLiteLocked(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM _prisma_migrations_lock WHERE id = 1
      `;
      return (result[0]?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async forceRelease(): Promise<void> {
    await this.detectDatabaseType();

    logger.warn("Force releasing migration lock...");

    switch (this.databaseType) {
      case "postgresql":
        await this.forceReleasePostgres();
        break;
      case "mysql":
        await this.forceReleaseMySQL();
        break;
      case "sqlite":
        await this.forceReleaseSQLite();
        break;
      default:
        logger.warn("Unknown database type, cannot force release lock");
    }

    logger.info("Migration lock force released");
  }

  private async forceReleasePostgres(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock_all()
      `;
    } catch (error) {
      logger.error(`Failed to force release PostgreSQL lock: ${error}`);
      throw error;
    }
  }

  private async forceReleaseMySQL(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT RELEASE_LOCK('prisma_migrations_lock')
      `;
    } catch (error) {
      logger.error(`Failed to force release MySQL lock: ${error}`);
      throw error;
    }
  }

  private async forceReleaseSQLite(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM _prisma_migrations_lock WHERE id = 1
      `;
    } catch (error) {
      logger.error(`Failed to force release SQLite lock: ${error}`);
      throw error;
    }
  }
}
