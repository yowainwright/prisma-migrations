import { describe, test, expect, mock } from "bun:test";
import {
  runMigrationsForMode,
  showSuccessTable,
  runAllMigrations,
  interactiveUp,
  runStepsMigrations,
  runToSpecificMigration,
  type UpDependencies,
} from "../../../../src/cli/commands/up";
import type { Migrations } from "../../../../src/migrations";

function createMockDeps(overrides: Partial<UpDependencies> = {}): UpDependencies {
  return {
    getSteps: mock(() => Promise.resolve(2)),
    getMigrationId: mock(() => Promise.resolve("001")),
    getMode: mock(() => Promise.resolve("all")),
    ...overrides,
  };
}

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

      const deps = createMockDeps();
      const count = await runMigrationsForMode("all", mockMigrations, pending, deps);

      expect(mockMigrations.up).toHaveBeenCalled();
      expect(count).toBe(3);
    });

    test('should run steps migrations when mode is "steps"', async () => {
      const mockMigrations = {
        up: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const pending = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
      ];

      const deps = createMockDeps({ getSteps: mock(() => Promise.resolve(2)) });
      const count = await runMigrationsForMode("steps", mockMigrations, pending, deps);

      expect(deps.getSteps).toHaveBeenCalledWith(2);
      expect(mockMigrations.up).toHaveBeenCalledWith(2);
      expect(count).toBe(2);
    });

    test('should run to specific migration when mode is "specific"', async () => {
      const mockMigrations = {
        upTo: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const pending = [{ id: "001", name: "test1", path: "/path/1" }];

      const deps = createMockDeps({ getMigrationId: mock(() => Promise.resolve("001")) });
      const count = await runMigrationsForMode("specific", mockMigrations, pending, deps);

      expect(deps.getMigrationId).toHaveBeenCalled();
      expect(mockMigrations.upTo).toHaveBeenCalledWith("001");
      expect(count).toBe(1);
    });

    test("should return 0 for unknown mode", async () => {
      const mockMigrations = {} as Migrations;
      const pending: any[] = [];
      const deps = createMockDeps();

      const count = await runMigrationsForMode("unknown", mockMigrations, pending, deps);

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

  describe("runStepsMigrations", () => {
    test("should run specified number of migrations", async () => {
      const mockMigrations = {
        up: mock(() => Promise.resolve(3)),
      } as unknown as Migrations;

      const pending = [
        { id: "1", name: "test1", path: "/path/1" },
        { id: "2", name: "test2", path: "/path/2" },
        { id: "3", name: "test3", path: "/path/3" },
      ];

      const deps = createMockDeps({ getSteps: mock(() => Promise.resolve(3)) });
      const count = await runStepsMigrations(mockMigrations, pending, deps);

      expect(deps.getSteps).toHaveBeenCalledWith(3);
      expect(mockMigrations.up).toHaveBeenCalledWith(3);
      expect(count).toBe(3);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Migration failed");
      const mockMigrations = {
        up: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      const pending = [{ id: "1", name: "test1", path: "/path/1" }];
      const deps = createMockDeps();

      await expect(runStepsMigrations(mockMigrations, pending, deps)).rejects.toThrow(
        "Migration failed",
      );
    });
  });

  describe("runToSpecificMigration", () => {
    test("should run migrations up to specified id", async () => {
      const mockMigrations = {
        upTo: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const pending = [
        { id: "001", name: "first", path: "/path/1" },
        { id: "002", name: "second", path: "/path/2" },
      ];

      const deps = createMockDeps({ getMigrationId: mock(() => Promise.resolve("002")) });
      const count = await runToSpecificMigration(mockMigrations, pending, deps);

      expect(deps.getMigrationId).toHaveBeenCalled();
      expect(mockMigrations.upTo).toHaveBeenCalledWith("002");
      expect(count).toBe(2);
    });

    test("should propagate errors", async () => {
      const testError = new Error("Migration not found");
      const mockMigrations = {
        upTo: mock(() => Promise.reject(testError)),
      } as unknown as Migrations;

      const pending = [{ id: "001", name: "first", path: "/path/1" }];
      const deps = createMockDeps();

      await expect(runToSpecificMigration(mockMigrations, pending, deps)).rejects.toThrow(
        "Migration not found",
      );
    });
  });

  describe("interactiveUp", () => {
    test("should return 0 when no pending migrations", async () => {
      const mockMigrations = {
        pending: mock(() => Promise.resolve([])),
      } as unknown as Migrations;

      const deps = createMockDeps();
      const count = await interactiveUp(mockMigrations, deps);

      expect(count).toBe(0);
      expect(mockMigrations.pending).toHaveBeenCalled();
    });

    test("should run all migrations when mode is all", async () => {
      const mockMigrations = {
        pending: mock(() => Promise.resolve([{ id: "1", name: "test", path: "/path" }])),
        up: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const deps = createMockDeps({ getMode: mock(() => Promise.resolve("all")) });
      const count = await interactiveUp(mockMigrations, deps);

      expect(count).toBe(1);
      expect(deps.getMode).toHaveBeenCalled();
    });

    test("should run steps migrations when mode is steps", async () => {
      const mockMigrations = {
        pending: mock(() =>
          Promise.resolve([
            { id: "1", name: "test1", path: "/path/1" },
            { id: "2", name: "test2", path: "/path/2" },
          ]),
        ),
        up: mock(() => Promise.resolve(2)),
      } as unknown as Migrations;

      const deps = createMockDeps({
        getMode: mock(() => Promise.resolve("steps")),
        getSteps: mock(() => Promise.resolve(2)),
      });
      const count = await interactiveUp(mockMigrations, deps);

      expect(count).toBe(2);
      expect(deps.getSteps).toHaveBeenCalled();
    });

    test("should run to specific migration when mode is specific", async () => {
      const mockMigrations = {
        pending: mock(() =>
          Promise.resolve([{ id: "001", name: "test", path: "/path" }]),
        ),
        upTo: mock(() => Promise.resolve(1)),
      } as unknown as Migrations;

      const deps = createMockDeps({
        getMode: mock(() => Promise.resolve("specific")),
        getMigrationId: mock(() => Promise.resolve("001")),
      });
      const count = await interactiveUp(mockMigrations, deps);

      expect(count).toBe(1);
      expect(deps.getMigrationId).toHaveBeenCalled();
    });
  });

  describe("showSuccessTable", () => {
    test("should not throw when displaying table", () => {
      expect(() => showSuccessTable(5)).not.toThrow();
    });

    test("should handle zero migrations", () => {
      expect(() => showSuccessTable(0)).not.toThrow();
    });

    test("should handle single migration", () => {
      expect(() => showSuccessTable(1)).not.toThrow();
    });
  });
});
