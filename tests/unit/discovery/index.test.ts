import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Discovery } from "../../../src/discovery";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const testDir = join(process.cwd(), "test-discovery");
const prismaDir = join(testDir, "prisma");
const migrationsDir = join(prismaDir, "migrations");
const nodeModulesDir = join(testDir, "node_modules");
const prismaClientDir = join(nodeModulesDir, "@prisma", "client");

describe("Discovery", () => {
  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe("findMigrationsDir", () => {
    test("should return provided migrationsDir from config", async () => {
      const customDir = "/custom/path/migrations";
      const discovery = new Discovery(testDir);
      const config = { migrationsDir: customDir };

      const result = await discovery.findMigrationsDir(config);

      expect(result).toBe(customDir);
    });

    test("should find prisma directory and return migrations path", async () => {
      mkdirSync(prismaDir, { recursive: true });
      const discovery = new Discovery(testDir);

      const result = await discovery.findMigrationsDir();

      expect(result).toBe(`${prismaDir}/migrations`);
    });

    test("should return default path when no prisma directory exists", async () => {
      const discovery = new Discovery(testDir);

      const result = await discovery.findMigrationsDir();

      expect(result).toBe("./prisma/migrations");
    });

    test("should ignore node_modules directories", async () => {
      const nodeModulesPrisma = join(nodeModulesDir, "some-package", "prisma");
      mkdirSync(nodeModulesPrisma, { recursive: true });
      mkdirSync(prismaDir, { recursive: true });

      const discovery = new Discovery(testDir);
      const result = await discovery.findMigrationsDir();

      expect(result).toBe(`${prismaDir}/migrations`);
    });
  });

  describe("findPrismaClient", () => {
    test("should return provided prismaClient from config", async () => {
      const mockClient = {
        $executeRaw: async () => 1,
        $queryRaw: async () => [],
        $raw: (value: string) => value,
      };

      const discovery = new Discovery(testDir);
      const config = { prismaClient: mockClient };

      const result = await discovery.findPrismaClient(config);

      expect(result).toBe(mockClient);
    });

    test("should throw error when no @prisma/client found", async () => {
      const discovery = new Discovery(testDir);

      await expect(discovery.findPrismaClient()).rejects.toThrow(
        'Could not find @prisma/client. Please run "prisma generate" first.',
      );
    });

    test("should find @prisma/client in node_modules", async () => {
      mkdirSync(prismaClientDir, { recursive: true });

      const indexPath = join(prismaClientDir, "index.js");
      writeFileSync(
        indexPath,
        `
        export class PrismaClient {
          async $executeRaw() { return 1; }
          async $queryRaw() { return []; }
          $raw(value) { return value; }
        }
      `,
      );

      const discovery = new Discovery(testDir);
      const result = await discovery.findPrismaClient();

      expect(result).toBeDefined();
      expect(typeof result.$executeRaw).toBe("function");
      expect(typeof result.$queryRaw).toBe("function");
      expect(typeof result.$raw).toBe("function");
    });

    test("should ignore nested node_modules", async () => {
      const nestedClientDir = join(
        nodeModulesDir,
        "some-package",
        "node_modules",
        "@prisma",
        "client",
      );
      mkdirSync(nestedClientDir, { recursive: true });

      const nestedIndexPath = join(nestedClientDir, "index.js");
      writeFileSync(nestedIndexPath, "export class PrismaClient {}");

      mkdirSync(prismaClientDir, { recursive: true });
      const indexPath = join(prismaClientDir, "index.js");
      writeFileSync(
        indexPath,
        `
        export class PrismaClient {
          async $executeRaw() { return 1; }
          async $queryRaw() { return []; }
          $raw(value) { return value; }
        }
      `,
      );

      const discovery = new Discovery(testDir);
      const result = await discovery.findPrismaClient();

      expect(result).toBeDefined();
    });
  });
});
