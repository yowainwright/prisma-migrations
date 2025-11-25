import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  MigrationLock,
  MigrationLockError,
} from "../../../src/migrations/locking";
import type { PrismaClient } from "../../../src/types";

describe("MigrationLock", () => {
  let mockPrisma: PrismaClient;
  let lock: MigrationLock;

  beforeEach(() => {
    mockPrisma = {
      $executeRaw: mock(() => Promise.resolve(1)),
      $executeRawUnsafe: mock(() => Promise.resolve(1)),
      $queryRaw: mock(() => Promise.resolve([])),
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

  describe("detectDatabaseType", () => {
    test("should detect PostgreSQL", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.resolve([{ version: "PostgreSQL 14.0" }]),
      );

      await lock.isLocked();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test("should detect MySQL when PostgreSQL query fails", async () => {
      let callCount = 0;
      mockPrisma.$queryRaw = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Not PostgreSQL"));
        }
        return Promise.resolve([{ version: "MySQL 8.0" }]);
      });

      await lock.isLocked();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test("should assume SQLite when both PostgreSQL and MySQL fail", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Not PostgreSQL or MySQL")),
      );

      const result = await lock.isLocked();

      expect(result).toBe(false);
    });
  });

  describe("tryLock", () => {
    test("should execute function when lock is acquired", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: true }]));

      const fn = mock(() => Promise.resolve(42));
      const result = await lock.tryLock(fn);

      expect(result.acquired).toBe(true);
      expect(result.result).toBe(42);
      expect(fn).toHaveBeenCalled();
    });

    test("should not execute function when lock is not acquired", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: false }]));

      const fn = mock(() => Promise.resolve(42));
      const result = await lock.tryLock(fn);

      expect(result.acquired).toBe(false);
      expect(result.result).toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    });

    test("should release lock after function executes", async () => {
      let lockAcquired = false;
      mockPrisma.$queryRaw = mock(() => {
        const result = !lockAcquired;
        lockAcquired = !lockAcquired;
        return Promise.resolve([{ locked: result }]);
      });

      const fn = mock(() => Promise.resolve());
      await lock.tryLock(fn);

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test("should release lock even if function throws", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: true }]));

      const fn = mock(() => Promise.reject(new Error("test error")));

      await expect(lock.tryLock(fn)).rejects.toThrow("test error");

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe("isLocked", () => {
    test("should return true when PostgreSQL lock is held", async () => {
      mockPrisma.$queryRaw = mock((query) => {
        const queryStr = String(query);
        const isVersionCheck = queryStr.includes("version()");
        const isLockCheck = queryStr.includes("pg_locks");

        if (isVersionCheck) {
          return Promise.resolve([{ version: "PostgreSQL" }]);
        }
        if (isLockCheck) {
          return Promise.resolve([{ locked: true }]);
        }
        return Promise.resolve([]);
      });

      const result = await lock.isLocked();
      expect(result).toBe(true);
    });

    test("should return false when no lock is held", async () => {
      mockPrisma.$queryRaw = mock((query) => {
        const queryStr = String(query);
        const isVersionCheck = queryStr.includes("version()");
        const isLockCheck = queryStr.includes("pg_locks");

        if (isVersionCheck) {
          return Promise.resolve([{ version: "PostgreSQL" }]);
        }
        if (isLockCheck) {
          return Promise.resolve([{ locked: false }]);
        }
        return Promise.resolve([]);
      });

      const result = await lock.isLocked();
      expect(result).toBe(false);
    });
  });

  describe("forceRelease", () => {
    test("should release PostgreSQL lock", async () => {
      mockPrisma.$queryRaw = mock((query) => {
        const queryStr = String(query);
        const isVersionCheck = queryStr.includes("version()");

        if (isVersionCheck) {
          return Promise.resolve([{ version: "PostgreSQL" }]);
        }
        return Promise.resolve([]);
      });

      await lock.forceRelease();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test("should release MySQL lock", async () => {
      let callCount = 0;
      mockPrisma.$queryRaw = mock((query) => {
        callCount++;
        const queryStr = String(query);
        const isVersionCheck = queryStr.includes("VERSION()");

        if (callCount === 1) {
          return Promise.reject(new Error("Not PostgreSQL"));
        }
        if (isVersionCheck) {
          return Promise.resolve([{ version: "MySQL" }]);
        }
        return Promise.resolve([]);
      });

      await lock.forceRelease();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test("should release SQLite lock", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Not PostgreSQL or MySQL")),
      );
      mockPrisma.$executeRaw = mock(() => Promise.resolve(1));

      await lock.forceRelease();

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe("withLock", () => {
    test("should timeout when lock cannot be acquired", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: false }]));

      const fn = mock(() => Promise.resolve());

      await expect(lock.withLock(fn, 1000)).rejects.toThrow(
        "Failed to acquire migration lock",
      );
    });

    test("should pass custom timeout to acquire", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: false }]));

      const fn = mock(() => Promise.resolve());
      const startTime = Date.now();

      await expect(lock.withLock(fn, 2000)).rejects.toThrow();

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(2000);
    });

    test("should execute function and release lock on success", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: true }]));

      const fn = mock(() => Promise.resolve(42));
      const result = await lock.withLock(fn);

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe("acquire", () => {
    test("should acquire lock successfully", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: true }]));

      await expect(lock.acquire(5000)).resolves.toBeUndefined();
    });

    test("should throw MigrationLockError with timeout flag", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: false }]));

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

    test("should release PostgreSQL lock", async () => {
      mockPrisma.$queryRaw = mock(() => Promise.resolve([{ locked: true }]));

      await lock.acquire(5000);
      await lock.release();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    test("should handle PostgreSQL lock acquisition errors", async () => {
      let callCount = 0;
      mockPrisma.$queryRaw = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([{ version: "PostgreSQL" }]);
        }
        throw new Error("Database error");
      });

      const result = await lock.tryLock(async () => 42);
      expect(result.acquired).toBe(false);
    });

    test("should handle MySQL lock acquisition errors", async () => {
      let callCount = 0;
      mockPrisma.$queryRaw = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Not PostgreSQL"));
        }
        if (callCount === 2) {
          return Promise.resolve([{ version: "MySQL" }]);
        }
        throw new Error("Database error");
      });

      const result = await lock.tryLock(async () => 42);
      expect(result.acquired).toBe(false);
    });

    test("should handle SQLite lock acquisition errors", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Not PostgreSQL or MySQL")),
      );
      mockPrisma.$executeRaw = mock(() => {
        throw new Error("Lock exists");
      });

      const result = await lock.tryLock(async () => 42);
      expect(result.acquired).toBe(false);
    });

    test("should handle PostgreSQL lock release errors", async () => {
      mockPrisma.$queryRaw = mock((query) => {
        const queryStr = String(query);
        if (queryStr.includes("pg_try_advisory_lock")) {
          return Promise.resolve([{ locked: true }]);
        }
        if (queryStr.includes("pg_advisory_unlock")) {
          throw new Error("Release error");
        }
        return Promise.resolve([{ version: "PostgreSQL" }]);
      });

      await lock.acquire(5000);
      await expect(lock.release()).resolves.toBeUndefined();
    });

    test("should handle MySQL lock release errors", async () => {
      let callCount = 0;
      mockPrisma.$queryRaw = mock((query) => {
        callCount++;
        const queryStr = String(query);
        if (callCount === 1) {
          return Promise.reject(new Error("Not PostgreSQL"));
        }
        if (queryStr.includes("VERSION()")) {
          return Promise.resolve([{ version: "MySQL" }]);
        }
        if (queryStr.includes("GET_LOCK")) {
          return Promise.resolve([{ locked: 1 }]);
        }
        if (queryStr.includes("RELEASE_LOCK")) {
          throw new Error("Release error");
        }
        return Promise.resolve([]);
      });

      await lock.acquire(5000);
      await expect(lock.release()).resolves.toBeUndefined();
    });

    test("should handle SQLite lock release errors", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Not PostgreSQL or MySQL")),
      );

      let callCount = 0;
      mockPrisma.$executeRaw = mock(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(1);
        }
        throw new Error("Release error");
      });

      await lock.acquire(5000);
      await expect(lock.release()).resolves.toBeUndefined();
    });

    test("should handle isLocked check errors for PostgreSQL", async () => {
      mockPrisma.$queryRaw = mock((query) => {
        const queryStr = String(query);
        if (queryStr.includes("version()")) {
          return Promise.resolve([{ version: "PostgreSQL" }]);
        }
        throw new Error("Check error");
      });

      const result = await lock.isLocked();
      expect(result).toBe(false);
    });

    test("should handle isLocked check errors for MySQL", async () => {
      let callCount = 0;
      mockPrisma.$queryRaw = mock((query) => {
        callCount++;
        const queryStr = String(query);
        if (callCount === 1) {
          return Promise.reject(new Error("Not PostgreSQL"));
        }
        if (queryStr.includes("VERSION()")) {
          return Promise.resolve([{ version: "MySQL" }]);
        }
        throw new Error("Check error");
      });

      const result = await lock.isLocked();
      expect(result).toBe(false);
    });

    test("should handle isLocked check errors for SQLite", async () => {
      mockPrisma.$queryRaw = mock(() =>
        Promise.reject(new Error("Not PostgreSQL or MySQL")),
      );

      const result = await lock.isLocked();
      expect(result).toBe(false);
    });
  });
});
