import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  MigrationLock,
  MigrationLockError,
} from "../../../src/migrations/locking";
import type { PrismaClient } from "../../../src/types";

describe("MigrationLock", () => {
  let mockPrisma: PrismaClient;
  let lock: MigrationLock;
  let locked: boolean;

  beforeEach(() => {
    locked = false;

    mockPrisma = {
      $executeRaw: mock((query) => {
        const queryString = String(query);

        if (queryString.includes("INSERT INTO _prisma_migrations_lock")) {
          if (locked) {
            return Promise.reject(new Error("Lock already exists"));
          }
          locked = true;
        }

        if (queryString.includes("DELETE FROM _prisma_migrations_lock") && !queryString.includes("locked_at")) {
          locked = false;
        }

        return Promise.resolve(1);
      }),
      $executeRawUnsafe: mock(() => Promise.resolve(1)),
      $queryRaw: mock(() =>
        Promise.resolve([{ count: locked ? 1 : 0 }]),
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
      locked = true;

      const fn = mock(() => Promise.resolve(42));
      const result = await lock.tryLock(fn);

      expect(result.acquired).toBe(false);
      expect(result.result).toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    });

    test("should release lock after function executes", async () => {
      const fn = mock(() => Promise.resolve());
      await lock.tryLock(fn);

      expect(locked).toBe(false);
    });

    test("should release lock even if function throws", async () => {
      const fn = mock(() => Promise.reject(new Error("test error")));

      await expect(lock.tryLock(fn)).rejects.toThrow("test error");
      expect(locked).toBe(false);
    });
  });

  describe("isLocked", () => {
    test("should return true when lock row exists", async () => {
      locked = true;

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
      locked = true;

      await lock.forceRelease();

      expect(locked).toBe(false);
    });
  });

  describe("withLock", () => {
    test("should timeout when lock cannot be acquired", async () => {
      locked = true;
      const fn = mock(() => Promise.resolve());

      await expect(lock.withLock(fn, 1000)).rejects.toThrow(
        "Failed to acquire migration lock",
      );
      expect(fn).not.toHaveBeenCalled();
    });

    test("should execute function and release lock on success", async () => {
      const fn = mock(() => Promise.resolve(42));
      const result = await lock.withLock(fn);

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
      expect(locked).toBe(false);
    });
  });

  describe("acquire", () => {
    test("should acquire lock successfully", async () => {
      await expect(lock.acquire(5000)).resolves.toBeUndefined();
      expect(locked).toBe(true);
    });

    test("should throw MigrationLockError with timeout flag", async () => {
      locked = true;

      try {
        await lock.acquire(1000);
        expect(true).toBe(false);
      } catch (error: any) {
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

      expect(locked).toBe(false);
    });
  });

  describe("error handling", () => {
    test("should return false when lock status check fails", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Check error")),
      );

      const result = await lock.isLocked();
      expect(result).toBe(false);
    });

    test("should propagate release errors", async () => {
      await lock.acquire(5000);
      mockPrisma.$executeRaw = mock((query) => {
        const queryString = String(query);
        if (queryString.includes("DELETE FROM _prisma_migrations_lock")) {
          return Promise.reject(new Error("Release error"));
        }
        return Promise.resolve(1);
      });

      await expect(lock.release()).rejects.toThrow("Release error");
    });
  });
});
