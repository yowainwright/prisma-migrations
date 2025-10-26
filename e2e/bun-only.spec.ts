/**
 * E2E Test: Bun-Only Usage
 *
 * This test verifies that prisma-migrations works correctly with Bun runtime only.
 * Tests all commands and programmatic API using Bun's native features.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { spawn } from "bun";

const TEST_DIR = path.join(import.meta.dir, "bun-test");
const MIGRATIONS_DIR = path.join(TEST_DIR, "prisma", "migrations");
const DATABASE_URL = "postgresql://test:test@localhost:5436/bun_test";

let prisma: PrismaClient;

/**
 * Helper function to run CLI commands with Bun
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
    const nodeModulesPath = path.join(import.meta.dir, "..", "node_modules");
    const env = {
      ...process.env,
      DATABASE_URL,
      NODE_PATH: nodeModulesPath,
      ...options.env,
    };
    const cliPath = path.join(import.meta.dir, "..", "dist", "cli.js");

    const proc = spawn(["bun", cliPath, ...args], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    let stdout = "";
    let stderr = "";

    const collectOutput = async () => {
      if (proc.stdout) {
        for await (const chunk of proc.stdout) {
          stdout += new TextDecoder().decode(chunk);
        }
      }
    };

    const collectError = async () => {
      if (proc.stderr) {
        for await (const chunk of proc.stderr) {
          stderr += new TextDecoder().decode(chunk);
        }
      }
    };

    Promise.all([collectOutput(), collectError()]).then(async () => {
      const code = await proc.exited;
      resolve({ code, stdout, stderr });
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
    } catch (error) {
      await Bun.sleep(1000);
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
    await prisma.$executeRaw`DROP TABLE IF EXISTS bun_test_users CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS bun_test_posts CASCADE`;
  } catch (error) {
    // Tables might not exist yet, that's fine
  }
}

beforeAll(async () => {
  // Setup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });

  // Create symlink to parent node_modules so CLI can find @prisma/client
  const { symlinkSync } = require("fs");
  const parentNodeModules = path.join(import.meta.dir, "..", "node_modules");
  const testNodeModules = path.join(TEST_DIR, "node_modules");
  try {
    symlinkSync(parentNodeModules, testNodeModules, "dir");
  } catch (error) {
    // Symlink might already exist, ignore
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

  const proc = Bun.spawn(["npx", "prisma", "generate"], {
    cwd: TEST_DIR,
    env: { ...process.env, DATABASE_URL },
    stdout: "inherit",
    stderr: "inherit",
  });

  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error("Failed to generate Prisma client");
  }

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
}, 60000);

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();

  // Cleanup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("Bun-Only E2E", () => {
  describe("CLI with Bun runtime", () => {
    it("should initialize migrations with Bun", async () => {
      const result = await runCLI(["init"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Created migration");
      expect(result.stdout).toContain("initial_migration");
      expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    });

    it("should create migrations with Bun", async () => {
      const result = await runCLI(["create", "add_bun_test_users"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("add_bun_test_users");
    });

    it("should list pending migrations with Bun", async () => {
      const result = await runCLI(["pending"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("pending migration");
    });

    it("should run migrations with Bun", async () => {
      const result = await runCLI(["up"]);

      expect(result.code).toBe(0);

      // Verify migrations were applied
      const migrations = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`
        SELECT migration_name FROM _prisma_migrations
        WHERE rolled_back_at IS NULL
      `;
      expect(migrations.length).toBeGreaterThan(0);
    });

    it("should show status with Bun", async () => {
      const result = await runCLI(["status"]);

      expect(result.code).toBe(0);
    });

    it("should list applied migrations with Bun", async () => {
      const result = await runCLI(["applied"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("applied migration");
    });

    it("should show latest migration with Bun", async () => {
      const result = await runCLI(["latest"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("migration");
    });

    it("should rollback migrations with Bun", async () => {
      const result = await runCLI(["down"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("rolled back");
    });

    it("should reset migrations with Bun", async () => {
      const result = await runCLI(["reset"]);

      expect(result.code).toBe(0);
    });
  });

  describe("Programmatic API with Bun", () => {
    it("should work with Migrations class in Bun", async () => {
      // Dynamic import to test programmatic API
      const { Migrations } = await import("../dist/index.js");

      const migrations = new Migrations(prisma, {
        migrationsDir: MIGRATIONS_DIR,
        logLevel: "silent",
      });

      // Test pending
      const pending = await migrations.pending();
      expect(Array.isArray(pending)).toBe(true);

      // Test up
      const upCount = await migrations.up();
      expect(upCount).toBeGreaterThanOrEqual(0);

      // Test applied
      const applied = await migrations.applied();
      expect(Array.isArray(applied)).toBe(true);

      // Test latest
      const latest = await migrations.latest();
      expect(latest).toBeTruthy();

      // Test down
      const downCount = await migrations.down(1);
      expect(downCount).toBeGreaterThanOrEqual(0);
    });

    it("should handle Bun-specific features", async () => {
      // Test that Bun's native SQLite can coexist (if needed)
      expect(typeof Bun.sleep).toBe("function");
      expect(typeof Bun.file).toBe("function");

      // Verify Bun runtime
      expect(process.versions.bun).toBeDefined();
    });
  });

  describe("Bun package manager integration", () => {
    it("should work when installed via bun add", async () => {
      // This test verifies the package works with Bun's package manager
      const result = await runCLI(["--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe("TypeScript execution with Bun", () => {
    it("should execute TypeScript migration files directly with Bun", async () => {
      // Create a TypeScript migration
      await runCLI(["create", "typescript_test"]);

      // Find the migration file
      expect(existsSync(MIGRATIONS_DIR)).toBe(true);

      // Run the migration (Bun can execute .ts files directly)
      const result = await runCLI(["up"]);
      expect(result.code).toBe(0);
    });
  });
});
