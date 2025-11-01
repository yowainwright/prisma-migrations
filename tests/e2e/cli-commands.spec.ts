/**
 * E2E Test: All CLI Commands
 *
 * This test verifies that all CLI commands work correctly:
 * - init
 * - create
 * - up (with --steps flag)
 * - down (with --steps flag)
 * - status
 * - pending
 * - applied
 * - latest
 * - reset
 * - fresh
 * - refresh
 * - Global flags: --verbose, --log-level
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const TEST_DIR = path.join(import.meta.dir, "cli-test");
const MIGRATIONS_DIR = path.join(TEST_DIR, "prisma", "migrations");
const DATABASE_URL = "postgresql://test:test@localhost:5435/cli_test";

let prisma: PrismaClient;

/**
 * Helper function to run CLI commands
 */
function runCLI(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const cwd = options.cwd || TEST_DIR;
    const env = {
      ...process.env,
      DATABASE_URL,
      ...options.env,
    };
    const cliPath = path.join(import.meta.dir, "..", "..", "dist", "cli.js");

    const child = spawn("node", [cliPath, ...args], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });
  });
}

/**
 * Wait for PostgreSQL to be ready
 */
async function waitForPostgres(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("PostgreSQL did not become ready in time");
}

/**
 * Clean up database
 */
async function cleanDatabase(): Promise<void> {
  try {
    await prisma.$executeRaw`DROP TABLE IF EXISTS _prisma_migrations CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS users CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS posts CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS comments CASCADE`;
  } catch {
    // Tables might not exist yet, that's fine
  }
}

beforeAll(async () => {
  // Setup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });

  const { symlinkSync, cpSync } = require("fs");
  const parentNodeModules = path.join(
    import.meta.dir,
    "..",
    "..",
    "node_modules",
  );
  const testNodeModules = path.join(TEST_DIR, "node_modules");

  try {
    if (existsSync(testNodeModules)) {
      rmSync(testNodeModules, { recursive: true, force: true });
    }
    symlinkSync(parentNodeModules, testNodeModules, "dir");
  } catch {
    cpSync(parentNodeModules, testNodeModules, { recursive: true });
  }

  // Create basic Prisma schema
  const schemaDir = path.join(TEST_DIR, "prisma");
  mkdirSync(schemaDir, { recursive: true });

  writeFileSync(
    path.join(schemaDir, "schema.prisma"),
    `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
`,
  );

  writeFileSync(
    path.join(TEST_DIR, ".prisma-migrationsrc.json"),
    JSON.stringify(
      {
        migrationsDir: "./prisma/migrations",
      },
      null,
      2,
    ),
  );

  const { execSync } = require("child_process");
  try {
    execSync("npx prisma generate", {
      cwd: TEST_DIR,
      env: { ...process.env, DATABASE_URL },
      stdio: "inherit",
    });
  } catch {
    throw new Error("Failed to generate Prisma client");
  }

  // Setup Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

  await waitForPostgres();
  await cleanDatabase();

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMP WITH TIME ZONE,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMP WITH TIME ZONE,
      started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();

  // Cleanup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("CLI Commands E2E", () => {
  describe("init command", () => {
    it("should initialize migrations directory with first migration", async () => {
      const result = await runCLI(["init"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("initial_migration");
      expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    });
  });

  describe("create command", () => {
    it("should create a new migration with a name", async () => {
      const result = await runCLI(["create", "add_users_table"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("add_users_table");
    });
  });

  describe("pending command", () => {
    it("should list pending migrations", async () => {
      const result = await runCLI(["pending"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("pending migration");
    });
  });

  describe("status command", () => {
    it("should show migration status", async () => {
      const result = await runCLI(["status"]);

      expect(result.code).toBe(0);
    });
  });

  describe("up command", () => {
    it("should run all pending migrations", async () => {
      const result = await runCLI(["up"]);

      if (result.code !== 0) {
        console.error("up command failed:");
        console.error("stdout:", result.stdout);
        console.error("stderr:", result.stderr);
      }
      expect(result.code).toBe(0);

      // Verify migrations were applied to database
      const migrations = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`
        SELECT migration_name FROM _prisma_migrations
        WHERE rolled_back_at IS NULL
        ORDER BY started_at
      `;
      expect(migrations.length).toBeGreaterThan(0);
    });

    it("should run migrations with --steps flag", async () => {
      // Create a new migration
      await runCLI(["create", "add_posts_table"]);

      const result = await runCLI(["up", "--steps", "1"]);

      expect(result.code).toBe(0);
    });
  });

  describe("applied command", () => {
    it("should list applied migrations", async () => {
      const result = await runCLI(["applied"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("applied migration");
    });
  });

  describe("latest command", () => {
    it("should show latest applied migration", async () => {
      const result = await runCLI(["latest"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("migration");
    });
  });

  describe("down command", () => {
    it("should rollback last migration", async () => {
      const result = await runCLI(["down"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("rolled back");
    });

    it("should rollback migrations with --steps flag", async () => {
      // First run up to have migrations to rollback
      await runCLI(["up"]);

      const result = await runCLI(["down", "--steps", "1"]);

      expect(result.code).toBe(0);
    });
  });

  describe("fresh command", () => {
    it("should rollback all migrations and re-run them", async () => {
      const result = await runCLI(["fresh", "--force"]);

      expect(result.code).toBe(0);
    });
  });

  describe("reset command", () => {
    it("should rollback all migrations", async () => {
      // First run some migrations
      await runCLI(["up"]);

      const result = await runCLI(["reset", "--force"]);

      expect(result.code).toBe(0);

      // Verify all migrations were rolled back
      const migrations = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`
        SELECT migration_name FROM _prisma_migrations
        WHERE rolled_back_at IS NULL
      `;
      expect(migrations.length).toBe(0);
    });
  });

  describe("refresh command", () => {
    it("should be an alias for fresh command", async () => {
      const result = await runCLI(["refresh", "--force"]);

      expect(result.code).toBe(0);
    });
  });

  describe("global flags", () => {
    it("should work with --verbose flag", async () => {
      const result = await runCLI(["status", "--verbose"]);

      expect(result.code).toBe(0);
    });

    it("should work with --log-level flag", async () => {
      const result = await runCLI(["--log-level", "debug", "status"]);

      expect(result.code).toBe(0);
    });
  });
});
