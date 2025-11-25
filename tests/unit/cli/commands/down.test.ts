import { describe, test, expect, mock } from "bun:test";
import {
  runRollbackForMode,
  rollbackOne,
  rollbackAll,
  rollbackSteps,
  rollbackToSpecific,
  showRollbackTable,
  interactiveDown,
  type DownDependencies,
} from "../../../../src/cli/commands/down";
import type { Migrations } from "../../../../src/migrations";

function createMockDeps(overrides: Partial<DownDependencies> = {}): DownDependencies {
  return {
    getSteps: mock(() => Promise.resolve(2)),
    getMigrationId: mock(() => Promise.resolve("001")),
    getMode: mock(() => Promise.resolve("one")),
    confirmReset: mock(() => Promise.resolve(true)),
    ...overrides,
  };
}

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

      const deps = createMockDeps();
      const count = await runRollbackForMode("one", mockMigrations, applied, deps);

      expect(mockMigrations.down).toHaveBeenCalledWith(1);
      expect(count).toBe(1);
    });

    test('should rollback all migrations when mode is "all"', async () => {
      const mockMigrations = {
        reset: mock(() => Promise.resolve(3)),
      } as unknown as Migrations;

      const applied = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
        { id: "3", name: "test3", path: "/path/3" },
      ];

      const deps = createMockDeps({ confirmReset: mock(() => Promise.resolve(true)) });
      const count = await runRollbackForMode("all", mockMigrations, applied, deps);

      expect(deps.confirmReset).toHaveBeenCalled();
      expect(mockMigrations.reset).toHaveBeenCalled();
      expect(count).toBe(3);
    });

    test('should rollback steps migrations when mode is "steps"', async () => {
      const mockMigrations = {
        down: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const applied = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
      ];

      const deps = createMockDeps({ getSteps: mock(() => Promise.resolve(2)) });
      const count = await runRollbackForMode("steps", mockMigrations, applied, deps);

      expect(deps.getSteps).toHaveBeenCalledWith(2);
      expect(mockMigrations.down).toHaveBeenCalledWith(2);
      expect(count).toBe(2);
    });

    test('should rollback to specific migration when mode is "specific"', async () => {
      const mockMigrations = {
        downTo: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const applied = [{ id: "001", name: "test1", path: "/path/1" }];

      const deps = createMockDeps({ getMigrationId: mock(() => Promise.resolve("001")) });
      const count = await runRollbackForMode("specific", mockMigrations, applied, deps);

      expect(deps.getMigrationId).toHaveBeenCalled();
      expect(mockMigrations.downTo).toHaveBeenCalledWith("001");
      expect(count).toBe(1);
    });

    test("should return 0 for unknown mode", async () => {
      const mockMigrations = {} as Migrations;
      const applied: any[] = [];
      const deps = createMockDeps();

      const count = await runRollbackForMode("unknown", mockMigrations, applied, deps);

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

      await expect(rollbackOne(mockMigrations)).rejects.toThrow("Rollback failed");
    });
  });

  describe("rollbackAll", () => {
    test("should reset all migrations when confirmed", async () => {
      const mockMigrations = {
        reset: mock(() => Promise.resolve(5)),
      } as unknown as Migrations;

      const deps = createMockDeps({ confirmReset: mock(() => Promise.resolve(true)) });
      const count = await rollbackAll(mockMigrations, deps);

      expect(deps.confirmReset).toHaveBeenCalled();
      expect(mockMigrations.reset).toHaveBeenCalled();
      expect(count).toBe(5);
    });

    test("should return 0 when not confirmed", async () => {
      const mockMigrations = {
        reset: mock(() => Promise.resolve(0)),
      } as unknown as Migrations;

      const deps = createMockDeps({ confirmReset: mock(() => Promise.resolve(false)) });
      const count = await rollbackAll(mockMigrations, deps);

      expect(deps.confirmReset).toHaveBeenCalled();
      expect(mockMigrations.reset).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Reset failed");
      const mockMigrations = {
        reset: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      const deps = createMockDeps({ confirmReset: mock(() => Promise.resolve(true)) });

      await expect(rollbackAll(mockMigrations, deps)).rejects.toThrow("Reset failed");
    });
  });

  describe("rollbackSteps", () => {
    test("should rollback specified number of migrations", async () => {
      const mockMigrations = {
        down: mock(() => Promise.resolve(3)),
      } as unknown as Migrations;

      const applied = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
        { id: "3", name: "test3", path: "/path/3" },
      ];

      const deps = createMockDeps({ getSteps: mock(() => Promise.resolve(3)) });
      const count = await rollbackSteps(mockMigrations, applied, deps);

      expect(deps.getSteps).toHaveBeenCalledWith(3);
      expect(mockMigrations.down).toHaveBeenCalledWith(3);
      expect(count).toBe(3);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Rollback failed");
      const mockMigrations = {
        down: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      const applied = [{ id: "1", name: "test1", path: "/path/1" }];
      const deps = createMockDeps();

      await expect(rollbackSteps(mockMigrations, applied, deps)).rejects.toThrow(
        "Rollback failed",
      );
    });
  });

  describe("rollbackToSpecific", () => {
    test("should rollback down to specified id", async () => {
      const mockMigrations = {
        downTo: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const applied = [
        { id: "001", name: "first", path: "/path/1" },
        { id: "002", name: "second", path: "/path/2" },
      ];

      const deps = createMockDeps({ getMigrationId: mock(() => Promise.resolve("002")) });
      const count = await rollbackToSpecific(mockMigrations, applied, deps);

      expect(deps.getMigrationId).toHaveBeenCalled();
      expect(mockMigrations.downTo).toHaveBeenCalledWith("002");
      expect(count).toBe(2);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Migration not found");
      const mockMigrations = {
        downTo: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      const applied = [{ id: "001", name: "first", path: "/path/1" }];
      const deps = createMockDeps();

      await expect(rollbackToSpecific(mockMigrations, applied, deps)).rejects.toThrow(
        "Migration not found",
      );
    });
  });

  describe("interactiveDown", () => {
    test("should return 0 when no applied migrations", async () => {
      const mockMigrations = {
        applied: mock(() => Promise.resolve([])),
      } as unknown as Migrations;

      const deps = createMockDeps();
      const count = await interactiveDown(mockMigrations, deps);

      expect(count).toBe(0);
      expect(mockMigrations.applied).toHaveBeenCalled();
    });

    test("should rollback one when mode is one", async () => {
      const mockMigrations = {
        applied: mock(() => Promise.resolve([{ id: "1", name: "test", path: "/path" }])),
        down: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const deps = createMockDeps({ getMode: mock(() => Promise.resolve("one")) });
      const count = await interactiveDown(mockMigrations, deps);

      expect(count).toBe(1);
      expect(deps.getMode).toHaveBeenCalled();
    });

    test("should rollback all when mode is all and confirmed", async () => {
      const mockMigrations = {
        applied: mock(() =>
          Promise.resolve([
            { id: "1", name: "test1", path: "/path/1" },
            { id: "2", name: "test2", path: "/path/2" },
          ]),
        ),
        reset: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const deps = createMockDeps({
        getMode: mock(() => Promise.resolve("all")),
        confirmReset: mock(() => Promise.resolve(true)),
      });
      const count = await interactiveDown(mockMigrations, deps);

      expect(count).toBe(2);
      expect(deps.confirmReset).toHaveBeenCalled();
    });

    test("should rollback steps when mode is steps", async () => {
      const mockMigrations = {
        applied: mock(() =>
          Promise.resolve([
            { id: "1", name: "test1", path: "/path/1" },
            { id: "2", name: "test2", path: "/path/2" },
          ]),
        ),
        down: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const deps = createMockDeps({
        getMode: mock(() => Promise.resolve("steps")),
        getSteps: mock(() => Promise.resolve(2)),
      });
      const count = await interactiveDown(mockMigrations, deps);

      expect(count).toBe(2);
      expect(deps.getSteps).toHaveBeenCalled();
    });

    test("should rollback to specific when mode is specific", async () => {
      const mockMigrations = {
        applied: mock(() =>
          Promise.resolve([{ id: "001", name: "test", path: "/path" }]),
        ),
        downTo: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const deps = createMockDeps({
        getMode: mock(() => Promise.resolve("specific")),
        getMigrationId: mock(() => Promise.resolve("001")),
      });
      const count = await interactiveDown(mockMigrations, deps);

      expect(count).toBe(1);
      expect(deps.getMigrationId).toHaveBeenCalled();
    });
  });

  describe("showRollbackTable", () => {
    test("should not throw when displaying table", () => {
      expect(() => showRollbackTable(3)).not.toThrow();
    });

    test("should handle zero migrations", () => {
      expect(() => showRollbackTable(0)).not.toThrow();
    });

    test("should handle single migration", () => {
      expect(() => showRollbackTable(1)).not.toThrow();
    });
  });
});
