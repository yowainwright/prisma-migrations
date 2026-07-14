import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  MigrationLock,
  MigrationLockError,
} from "../../../src/migrations/locking";
import type { PrismaClient } from "../../../src/types";

describe("MigrationLock", () => {
  let mockPrisma: PrismaClient;
  let lock: MigrationLock;
  let activeOwner: string | null;
  let heartbeatCount: number;

  const executeRaw = (query: TemplateStringsArray, ...values: unknown[]) => {
    const queryString = String(query);
    const isInsert = queryString.includes(
      "INSERT INTO _prisma_migrations_lock_v2",
    );
    const hasConflict = isInsert && Boolean(activeOwner);
    if (hasConflict)
      return Promise.reject(new Error("UNIQUE constraint failed"));
    if (isInsert) activeOwner = String(values[0]);

    const isHeartbeat = queryString.includes(
      "UPDATE _prisma_migrations_lock_v2",
    );
    const heartbeatOwned = activeOwner === values[1];
    if (isHeartbeat) heartbeatCount += 1;
    if (isHeartbeat) return Promise.resolve(Number(heartbeatOwned));

    const isOwnerRelease = queryString.includes("owner_id =");
    const releaseOwned = activeOwner === values[0];
    if (isOwnerRelease && releaseOwned) activeOwner = null;

    const isForceRelease =
      queryString.includes("WHERE id = 1") && !queryString.includes("AND");
    if (isForceRelease) activeOwner = null;
    return Promise.resolve(1);
  };

  beforeEach(() => {
    activeOwner = null;
    heartbeatCount = 0;

    mockPrisma = {
      $executeRaw: mock(executeRaw),
      $executeRawUnsafe: mock(() => Promise.resolve(1)),
      $queryRaw: mock(() =>
        Promise.resolve([{ count: Number(Boolean(activeOwner)) }]),
      ) as PrismaClient["$queryRaw"],
      $transaction: mock((fn) => fn(mockPrisma)),
      $disconnect: mock(() => Promise.resolve()),
    };

    lock = new MigrationLock(mockPrisma);
  });

  describe("MigrationLockError", () => {
    test("should create error with timeout flag", () => {
      const error = new MigrationLockError("test", true);
      expect(error.isTimeout).toBe(true);
      expect(error.message).toBe("test");
      expect(error.name).toBe("MigrationLockError");
    });

    test("should create error without timeout flag", () => {
      const error = new MigrationLockError("test");
      expect(error.isTimeout).toBe(false);
    });
  });

  describe("tryLock", () => {
    test("should execute function when lock is acquired", async () => {
      const fn = mock(() => Promise.resolve(42));
      const result = await lock.tryLock(fn);

      expect(result.acquired).toBe(true);
      expect(result.result).toBe(42);
      expect(fn).toHaveBeenCalled();
    });

    test("should not execute function when lock is not acquired", async () => {
      activeOwner = "existing-owner";

      const fn = mock(() => Promise.resolve(42));
      const result = await lock.tryLock(fn);

      expect(result.acquired).toBe(false);
      expect(result.result).toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    });

    test("should release lock after function executes", async () => {
      const fn = mock(() => Promise.resolve());
      await lock.tryLock(fn);

      expect(activeOwner).toBeNull();
    });

    test("should release lock even if function throws", async () => {
      const fn = mock(() => Promise.reject(new Error("test error")));

      await expect(lock.tryLock(fn)).rejects.toThrow("test error");
      expect(activeOwner).toBeNull();
    });
  });

  describe("isLocked", () => {
    test("should return true when lock row exists", async () => {
      activeOwner = "existing-owner";

      const result = await lock.isLocked();
      expect(result).toBe(true);
    });

    test("should return false when no lock is held", async () => {
      const result = await lock.isLocked();
      expect(result).toBe(false);
    });
  });

  describe("forceRelease", () => {
    test("should release table lock", async () => {
      activeOwner = "existing-owner";

      await lock.forceRelease();

      expect(activeOwner).toBeNull();
    });
  });

  describe("withLock", () => {
    test("should timeout when lock cannot be acquired", async () => {
      activeOwner = "existing-owner";
      const fn = mock(() => Promise.resolve());

      await expect(lock.withLock(fn, 50)).rejects.toThrow(
        "Failed to acquire migration lock",
      );
      expect(fn).not.toHaveBeenCalled();
    });

    test("should execute function and release lock on success", async () => {
      const fn = mock(() => Promise.resolve(42));
      const result = await lock.withLock(fn);

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
      expect(activeOwner).toBeNull();
    });

    test("should renew the lease during long-running work", async () => {
      lock = new MigrationLock(mockPrisma, 30);
      const work = () =>
        new Promise<void>((resolve) => setTimeout(resolve, 45));

      await lock.withLock(work);

      expect(heartbeatCount).toBeGreaterThan(0);
    });
  });

  describe("acquire", () => {
    test("should acquire lock successfully", async () => {
      await expect(lock.acquire(5000)).resolves.toBeUndefined();
      expect(activeOwner).not.toBeNull();
    });

    test("should throw MigrationLockError with timeout flag", async () => {
      activeOwner = "existing-owner";

      try {
        await lock.acquire(50);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MigrationLockError);
        if (!(error instanceof MigrationLockError)) return;
        expect(error.name).toBe("MigrationLockError");
        expect(error.isTimeout).toBe(true);
      }
    });
  });

  describe("release", () => {
    test("should warn when releasing non-acquired lock", async () => {
      await lock.release();
    });

    test("should release acquired lock", async () => {
      await lock.acquire(5000);
      await lock.release();

      expect(activeOwner).toBeNull();
    });

    test("should not release a replacement owner", async () => {
      await lock.acquire(5000);
      activeOwner = "replacement-owner";

      await lock.release();

      expect(activeOwner).toBe("replacement-owner");
    });
  });

  describe("error handling", () => {
    test("should propagate lock status errors", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Check error")),
      );

      await expect(lock.isLocked()).rejects.toThrow("Check error");
    });

    test("should propagate release errors", async () => {
      await lock.acquire(5000);
      mockPrisma.$executeRaw = mock((query) => {
        const queryString = String(query);
        if (queryString.includes("DELETE FROM _prisma_migrations_lock_v2")) {
          return Promise.reject(new Error("Release error"));
        }
        return Promise.resolve(1);
      });

      await expect(lock.release()).rejects.toThrow("Release error");
    });
  });
});
