import { describe, test, expect, mock } from "bun:test";
import {
  runRollbackForMode,
  rollbackOne,
  showRollbackTable,
  interactiveDown,
} from "../../../../src/cli/commands/down";
import type { Migrations } from "../../../../src/migrations";

describe("down command", () => {
  describe("runRollbackForMode", () => {
    test('should rollback one migration when mode is "one"', async () => {
      const mockMigrations = {
        down: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const applied = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
      ];

      const count = await runRollbackForMode("one", mockMigrations, applied);

      expect(mockMigrations.down).toHaveBeenCalledWith(1);
      expect(count).toBe(1);
    });


    test("should return 0 for unknown mode", async () => {
      const mockMigrations = {} as Migrations;
      const applied = [];

      const count = await runRollbackForMode(
        "unknown",
        mockMigrations,
        applied,
      );

      expect(count).toBe(0);
    });
  });

  describe("rollbackOne", () => {
    test("should call migrations.down with 1", async () => {
      const mockMigrations = {
        down: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const count = await rollbackOne(mockMigrations);

      expect(mockMigrations.down).toHaveBeenCalledWith(1);
      expect(count).toBe(1);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Rollback failed");
      const mockMigrations = {
        down: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      await expect(rollbackOne(mockMigrations)).rejects.toThrow(
        "Rollback failed",
      );
    });
  });

  describe("interactiveDown", () => {
    test("should return 0 when no applied migrations", async () => {
      const mockMigrations = {
        applied: mock(() => Promise.resolve([])),
      } as unknown as Migrations;

      const count = await interactiveDown(mockMigrations);

      expect(count).toBe(0);
      expect(mockMigrations.applied).toHaveBeenCalled();
    });
  });

  describe("showRollbackTable", () => {
    test("should not throw when displaying table", () => {
      expect(() => showRollbackTable(3)).not.toThrow();
    });
  });
});
