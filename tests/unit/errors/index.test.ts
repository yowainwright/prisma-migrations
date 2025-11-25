import { describe, test, expect } from "bun:test";
import {
  MigrationError,
  createMigrationNotFoundError,
  createDatabaseConnectionError,
  createInvalidMigrationError,
  createChecksumMismatchError,
  createNoMigrationsError,
  createMigrationFailedError,
  createRollbackFailedError,
  createPrismaClientNotFoundError,
  createMigrationLockTimeoutError,
  createTransactionFailedError,
} from "../../../src/errors";

describe("MigrationError", () => {
  test("should create error with message", () => {
    const error = new MigrationError("Test error");

    expect(error.message).toBe("Test error");
    expect(error.name).toBe("MigrationError");
  });

  test("should create error with suggestions", () => {
    const error = new MigrationError("Test error", [
      "Suggestion 1",
      "Suggestion 2",
    ]);

    expect(error.suggestions).toHaveLength(2);
    expect(error.suggestions[0]).toBe("Suggestion 1");
  });

  test("should create error with help command", () => {
    const error = new MigrationError(
      "Test error",
      [],
      "prisma-migrations help",
    );

    expect(error.helpCommand).toBe("prisma-migrations help");
  });

  test("should format error message", () => {
    const error = new MigrationError("Test error");
    const formatted = error.format();

    expect(formatted).toContain("Test error");
  });

  test("should format error with suggestions", () => {
    const error = new MigrationError("Test error", ["Try this"]);
    const formatted = error.format();

    expect(formatted).toContain("Suggestions:");
    expect(formatted).toContain("Try this");
  });

  test("should format error with help command", () => {
    const error = new MigrationError("Test error", [], "help");
    const formatted = error.format();

    expect(formatted).toContain("Need help?");
    expect(formatted).toContain("help");
  });
});

describe("Error factory functions", () => {
  describe("createMigrationNotFoundError", () => {
    test("should create migration not found error", () => {
      const error = createMigrationNotFoundError("123_test");

      expect(error.message).toContain("123_test");
      expect(error.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("createDatabaseConnectionError", () => {
    test("should create database connection error", () => {
      const originalError = new Error("Connection refused");
      const error = createDatabaseConnectionError(originalError);

      expect(error.message).toContain("Connection refused");
      expect(error.suggestions.some((s) => s.includes("DATABASE_URL"))).toBe(
        true,
      );
    });
  });

  describe("createInvalidMigrationError", () => {
    test("should create invalid migration error", () => {
      const error = createInvalidMigrationError("123_test", "missing SQL");

      expect(error.message).toContain("123_test");
      expect(error.message).toContain("missing SQL");
      expect(error.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("createChecksumMismatchError", () => {
    test("should create checksum mismatch error", () => {
      const error = createChecksumMismatchError("123_test");

      expect(error.message).toContain("123_test");
      expect(error.message).toContain("modified");
      expect(error.suggestions.some((s) => s.includes("production"))).toBe(
        true,
      );
    });
  });

  describe("createNoMigrationsError", () => {
    test("should create no migrations error", () => {
      const error = createNoMigrationsError();

      expect(error.message).toContain("No migrations found");
      expect(error.suggestions.some((s) => s.includes("init"))).toBe(true);
    });
  });

  describe("createMigrationFailedError", () => {
    test("should create migration failed error", () => {
      const originalError = new Error("Syntax error");
      const error = createMigrationFailedError("123_test", originalError);

      expect(error.message).toContain("123_test");
      expect(error.message).toContain("Syntax error");
      expect(error.suggestions.some((s) => s.includes("SQL"))).toBe(true);
    });
  });

  describe("createRollbackFailedError", () => {
    test("should create rollback failed error", () => {
      const originalError = new Error("Constraint violation");
      const error = createRollbackFailedError("123_test", originalError);

      expect(error.message).toContain("123_test");
      expect(error.message).toContain("Constraint violation");
      expect(error.suggestions.some((s) => s.includes("Down"))).toBe(true);
    });
  });

  describe("createPrismaClientNotFoundError", () => {
    test("should create Prisma client not found error", () => {
      const error = createPrismaClientNotFoundError();

      expect(error.message).toContain("Prisma Client not found");
      expect(error.suggestions.some((s) => s.includes("@prisma/client"))).toBe(
        true,
      );
    });
  });

  describe("createMigrationLockTimeoutError", () => {
    test("should create lock timeout error with timeout in milliseconds", () => {
      const error = createMigrationLockTimeoutError(30000);
      expect(error.message).toContain("30s");
      expect(error.suggestions.length).toBeGreaterThan(0);
      expect(error.suggestions.some((s) => s.includes("upIfNotLocked"))).toBe(
        true,
      );
    });

    test("should include lock check commands in suggestions", () => {
      const error = createMigrationLockTimeoutError(60000);
      expect(error.message).toContain("60s");
      expect(
        error.suggestions.some((s) => s.includes("npx prisma-migrations lock")),
      ).toBe(true);
    });
  });

  describe("createTransactionFailedError", () => {
    test("should create transaction failed error with migration ID", () => {
      const dbError = new Error("Unique constraint violation");
      const error = createTransactionFailedError("001_test_migration", dbError);
      expect(error.message).toContain("001_test_migration");
      expect(error.message).toContain("Unique constraint violation");
      expect(error.suggestions.length).toBeGreaterThan(0);
    });

    test("should mention automatic rollback in suggestions", () => {
      const dbError = new Error("Foreign key constraint");
      const error = createTransactionFailedError("002_add_fk", dbError);
      expect(
        error.suggestions.some((s) => s.includes("rolled back automatically")),
      ).toBe(true);
    });
  });
});
