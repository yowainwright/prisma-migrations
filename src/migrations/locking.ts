import { randomUUID } from "crypto";
import { logger } from "../logger";
import type { PrismaClient } from "../types";

type CountValue = number | bigint | string;
type AsyncResult<T> = Promise<T>;
type BooleanResult = Promise<boolean>;
type HeartbeatResult = Promise<Error | null>;
type VoidResult = Promise<void>;
type NumberResult = Promise<number>;

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_LEASE_DURATION_MS = 30 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 1000;
const MIN_HEARTBEAT_DELAY_MS = 10;
const LOCK_CONFLICT_PATTERN = /unique|duplicate|constraint|23505|1062/i;

function delay(durationMs: number): VoidResult {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function isLockConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  let code = "";
  if ("code" in error) code = String(error.code);
  const details = `${code} ${error.message}`;
  return LOCK_CONFLICT_PATTERN.test(details);
}

export class MigrationLockError extends Error {
  public readonly isTimeout: boolean;

  constructor(message: string, isTimeout = false) {
    super(message);
    this.name = "MigrationLockError";
    this.isTimeout = isTimeout;
  }
}

export class MigrationLock {
  private ensurePromise: VoidResult | null = null;
  private ownerId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTask: VoidResult | null = null;
  private heartbeatError: Error | null = null;
  private readonly leaseDurationMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
  ) {
    this.leaseDurationMs = leaseDurationMs;
  }

  private createLockTable(): NumberResult {
    return this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS _prisma_migrations_lock_v2 (
        id INTEGER NOT NULL PRIMARY KEY,
        owner_id VARCHAR(36) NOT NULL,
        locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `;
  }

  private async initializeLockTable(): VoidResult {
    try {
      await this.createLockTable();
    } catch {
      await delay(50);
      await this.createLockTable();
    }
  }

  private ensureLockTable(): VoidResult {
    if (!this.ensurePromise) {
      this.ensurePromise = this.initializeLockTable().catch((error) => {
        this.ensurePromise = null;
        throw error;
      });
    }
    return this.ensurePromise;
  }

  private async clearExpiredLock(): VoidResult {
    await this.prisma.$executeRaw`
      DELETE FROM _prisma_migrations_lock_v2
      WHERE id = 1 AND expires_at < CURRENT_TIMESTAMP
    `;
  }

  private async tryAcquire(): BooleanResult {
    await this.clearExpiredLock();
    const ownerId = randomUUID();
    const expiresAt = new Date(Date.now() + this.leaseDurationMs);
    try {
      await this.prisma.$executeRaw`
        INSERT INTO _prisma_migrations_lock_v2 (id, owner_id, expires_at)
        VALUES (1, ${ownerId}, ${expiresAt})
      `;
      this.ownerId = ownerId;
      return true;
    } catch (error) {
      if (isLockConflict(error)) return false;
      throw error;
    }
  }

  async acquire(timeoutMs = DEFAULT_TIMEOUT_MS): VoidResult {
    const startedAt = Date.now();
    await this.ensureLockTable();
    while (Date.now() - startedAt < timeoutMs) {
      const acquired = await this.tryAcquire();
      if (acquired) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, timeoutMs - elapsed);
      const retryDelay = Math.min(MAX_RETRY_DELAY_MS, remaining);
      await delay(retryDelay);
    }
    const message =
      `Failed to acquire migration lock after ${timeoutMs}ms. ` +
      "Another migration may be in progress.";
    throw new MigrationLockError(message, true);
  }

  private async renew(): VoidResult {
    if (!this.ownerId) return;
    const expiresAt = new Date(Date.now() + this.leaseDurationMs);
    const updated = await this.prisma.$executeRaw`
      UPDATE _prisma_migrations_lock_v2
      SET expires_at = ${expiresAt}
      WHERE id = 1 AND owner_id = ${this.ownerId}
    `;
    if (updated === 0) {
      throw new MigrationLockError("Migration lock ownership was lost");
    }
  }

  private scheduleHeartbeat(): void {
    const leaseInterval = Math.floor(this.leaseDurationMs / 3);
    const interval = Math.max(MIN_HEARTBEAT_DELAY_MS, leaseInterval);
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTask = this.renew()
        .catch((error) => {
          this.heartbeatError = toError(error);
        })
        .finally(() => {
          const shouldContinue = Boolean(this.ownerId) && !this.heartbeatError;
          if (shouldContinue) this.scheduleHeartbeat();
        });
    }, interval);
  }

  private startHeartbeat(): void {
    this.heartbeatError = null;
    this.scheduleHeartbeat();
  }

  private async stopHeartbeat(): HeartbeatResult {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.heartbeatTask) await this.heartbeatTask;
    this.heartbeatTask = null;
    return this.heartbeatError;
  }

  async release(): VoidResult {
    if (!this.ownerId) {
      logger.warn("Attempted to release lock that was not acquired");
      return;
    }
    const ownerId = this.ownerId;
    this.ownerId = null;
    await this.prisma.$executeRaw`
      DELETE FROM _prisma_migrations_lock_v2
      WHERE id = 1 AND owner_id = ${ownerId}
    `;
  }

  private async runWithHeartbeat<T>(fn: () => AsyncResult<T>) {
    this.startHeartbeat();
    try {
      const result = await fn();
      const heartbeatError = await this.stopHeartbeat();
      if (heartbeatError) throw heartbeatError;
      return result;
    } finally {
      await this.stopHeartbeat();
      await this.release();
    }
  }

  async tryLock<T>(fn: () => AsyncResult<T>) {
    await this.ensureLockTable();
    const acquired = await this.tryAcquire();
    if (!acquired) return { acquired: false };
    const result = await this.runWithHeartbeat(fn);
    return { acquired: true, result };
  }

  async withLock<T>(
    fn: () => AsyncResult<T>,
    timeoutMs: number | undefined = undefined,
  ) {
    await this.acquire(timeoutMs);
    return this.runWithHeartbeat(fn);
  }

  async isLocked(): BooleanResult {
    await this.ensureLockTable();
    await this.clearExpiredLock();
    const result = await this.prisma.$queryRaw<Array<{ count: CountValue }>>`
      SELECT COUNT(*) as count
      FROM _prisma_migrations_lock_v2
      WHERE id = 1 AND expires_at >= CURRENT_TIMESTAMP
    `;
    const firstRow = result[0];
    if (!firstRow) return false;
    return Number(firstRow.count) > 0;
  }

  async forceRelease(): VoidResult {
    await this.ensureLockTable();
    await this.prisma.$executeRaw`
      DELETE FROM _prisma_migrations_lock_v2 WHERE id = 1
    `;
    this.ownerId = null;
    logger.info("Migration lock force released");
  }
}
