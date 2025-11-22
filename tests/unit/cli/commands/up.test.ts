import { describe, test, expect, mock } from "bun:test";
import {
  runMigrationsForMode,
  showSuccessTable,
  runAllMigrations,
  interactiveUp,
} from "../../../../src/cli/commands/up";
import type { Migrations } from "../../../../src/migrations";

describe("up command", () => {
  describe("runMigrationsForMode", () => {
    test('should run all migrations when mode is "all"', async () => {
      const mockMigrations = {
        up: mock(() => Promise.resolve(3)),
      } as unknown as Migrations;

      const pending = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
        { id: "3", name: "test3", path: "/path/3" },
      ];

      const count = await runMigrationsForMode("all", mockMigrations, pending);

      expect(mockMigrations.up).toHaveBeenCalled();
      expect(count).toBe(3);
    });

    test("should return 0 for unknown mode", async () => {
      const mockMigrations = {} as Migrations;
      const pending = [];

      const count = await runMigrationsForMode(
        "unknown",
        mockMigrations,
        pending,
      );

      expect(count).toBe(0);
    });
  });

  describe("runAllMigrations", () => {
    test("should run all pending migrations", async () => {
      const mockMigrations = {
        up: mock(() => Promise.resolve(5)),
      } as unknown as Migrations;

      const count = await runAllMigrations(mockMigrations);

      expect(mockMigrations.up).toHaveBeenCalled();
      expect(count).toBe(5);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Migration failed");
      const mockMigrations = {
        up: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      await expect(runAllMigrations(mockMigrations)).rejects.toThrow(
        "Migration failed",
      );
    });
  });

  describe("interactiveUp", () => {
    test("should return 0 when no pending migrations", async () => {
      const mockMigrations = {
        pending: mock(() => Promise.resolve([])),
      } as unknown as Migrations;

      const count = await interactiveUp(mockMigrations);

      expect(count).toBe(0);
      expect(mockMigrations.pending).toHaveBeenCalled();
    });
  });

  describe("showSuccessTable", () => {
    test("should not throw when displaying table", () => {
      expect(() => showSuccessTable(5)).not.toThrow();
    });
  });
});
