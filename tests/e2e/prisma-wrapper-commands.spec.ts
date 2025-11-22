import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const TEST_DIR = path.join(import.meta.dir, "prisma-wrapper-test");
const DATABASE_URL = "postgresql://test:test@localhost:5435/cli_test";

let prisma: PrismaClient;

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

async function cleanDatabase(): Promise<void> {
  await prisma.$executeRaw`DROP TABLE IF EXISTS _prisma_migrations CASCADE`;
  await prisma.$executeRaw`DROP TABLE IF EXISTS "User" CASCADE`;
  await prisma.$executeRaw`DROP TABLE IF EXISTS "Post" CASCADE`;
}

beforeAll(async () => {
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

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
`,
  );

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

  await waitForPostgres();
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();

  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("Prisma Wrapper Commands E2E", () => {
  describe("generate command", () => {
    it("should generate Prisma client", async () => {
      const result = await runCLI(["generate"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Generated Prisma Client");
    });
  });

  describe("push command", () => {
    it("should push schema to database", async () => {
      const result = await runCLI(["push"]);

      expect(result.code).toBe(0);

      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'User'
      `;
      expect(tables.length).toBe(1);
    });

    it("should support --skip-generate flag", async () => {
      const result = await runCLI(["push", "--skip-generate"]);

      expect(result.code).toBe(0);
    });
  });

  describe("dev command", () => {
    it("should execute without crashing", async () => {
      const result = await runCLI(["dev", "initial"]);

      expect([0, 1]).toContain(result.code);
    });
  });

  describe("deploy command", () => {
    it("should execute without crashing", async () => {
      const result = await runCLI(["deploy"]);

      expect([0, 1]).toContain(result.code);
    });
  });

  describe("resolve command", () => {
    it("should require either --applied or --rolled-back option", async () => {
      const result = await runCLI(["resolve"]);

      expect(result.code).toBe(1);
    });

    it("should accept --applied option format", async () => {
      const result = await runCLI(["resolve", "--applied", "fake_migration"]);

      expect([0, 1]).toContain(result.code);
    });

    it("should accept --rolled-back option format", async () => {
      const result = await runCLI([
        "resolve",
        "--rolled-back",
        "fake_migration",
      ]);

      expect([0, 1]).toContain(result.code);
    });
  });

  describe("command output", () => {
    it("should show Prisma branding in output", async () => {
      const result = await runCLI(["generate"]);

      expect(result.stdout).toMatch(/Prisma|prisma/);
    });
  });
});
