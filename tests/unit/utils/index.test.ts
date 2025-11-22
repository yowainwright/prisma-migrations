import { describe, test, expect } from "bun:test";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import {
  generateMigrationId,
  validateMigrationName,
  formatMigration,
  generateChecksum,
} from "../../../src/utils";
import type { MigrationFile } from "../../../src/types";

describe("utils", () => {
  describe("generateMigrationId", () => {
    test("should generate id with correct format", () => {
      const id = generateMigrationId();

      expect(id).toMatch(/^\d{17}$/);
    });

    test("should generate unique ids when called with delay", async () => {
      const id1 = generateMigrationId();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const id2 = generateMigrationId();

      expect(id1).not.toBe(id2);
    });

    test("should generate id based on current timestamp", () => {
      const id = generateMigrationId();
      const year = new Date().getFullYear().toString();

      expect(id.substring(0, 4)).toBe(year);
    });
  });

  describe("validateMigrationName", () => {
    test("should accept valid lowercase names", () => {
      expect(validateMigrationName("add_users_table")).toBe(true);
      expect(validateMigrationName("update_schema")).toBe(true);
      expect(validateMigrationName("create_index")).toBe(true);
    });

    test("should accept names with numbers", () => {
      expect(validateMigrationName("add_column_2")).toBe(true);
      expect(validateMigrationName("migration123")).toBe(true);
    });

    test("should accept names with underscores", () => {
      expect(validateMigrationName("add_user_email_column")).toBe(true);
    });

    test("should reject uppercase letters", () => {
      expect(validateMigrationName("AddUsersTable")).toBe(false);
      expect(validateMigrationName("add_Users_table")).toBe(false);
    });

    test("should reject spaces", () => {
      expect(validateMigrationName("add users table")).toBe(false);
    });

    test("should reject hyphens", () => {
      expect(validateMigrationName("add-users-table")).toBe(false);
    });

    test("should reject special characters", () => {
      expect(validateMigrationName("add@users")).toBe(false);
      expect(validateMigrationName("add.users")).toBe(false);
      expect(validateMigrationName("add!users")).toBe(false);
    });

    test("should reject empty string", () => {
      expect(validateMigrationName("")).toBe(false);
    });
  });

  describe("formatMigration", () => {
    test("should format migration with id and name", () => {
      const migration: MigrationFile = {
        id: "20240101000000000",
        name: "add_users",
        path: "/path/to/migration",
      };

      const formatted = formatMigration(migration);

      expect(formatted).toBe("20240101000000000_add_users");
    });

    test("should handle different migration names", () => {
      const migration: MigrationFile = {
        id: "12345",
        name: "test_migration",
        path: "/path",
      };

      expect(formatMigration(migration)).toBe("12345_test_migration");
    });
  });

  describe("generateChecksum", () => {
    const testDir = join(import.meta.dir, "checksum-test");
    const testFile = join(testDir, "test.sql");

    test("should generate consistent checksum for same content", async () => {
      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, "SELECT * FROM users;");

      const checksum1 = await generateChecksum(testFile);
      const checksum2 = await generateChecksum(testFile);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/);

      await rm(testDir, { recursive: true });
    });

    test("should generate different checksums for different content", async () => {
      await mkdir(testDir, { recursive: true });

      await writeFile(testFile, "SELECT * FROM users;");
      const checksum1 = await generateChecksum(testFile);

      await writeFile(testFile, "SELECT * FROM posts;");
      const checksum2 = await generateChecksum(testFile);

      expect(checksum1).not.toBe(checksum2);

      await rm(testDir, { recursive: true });
    });

    test("should throw error for non-existent file", async () => {
      const nonExistentFile = join(testDir, "nonexistent.sql");

      await expect(generateChecksum(nonExistentFile)).rejects.toThrow();
    });
  });
});
