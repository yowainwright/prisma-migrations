/**
 * E2E Code Lab: Starting a New Project with Prisma ORM and prisma-migrations
 *
 * This code lab walks through setting up a new project from scratch with:
 * - PostgreSQL database
 * - Prisma ORM
 * - prisma-migrations for migration management
 *
 * It serves as both a test and a tutorial that can be followed step-by-step.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";

const TEST_DIR = path.join(import.meta.dir, "codelab-new");
const MIGRATIONS_DIR = path.join(TEST_DIR, "prisma", "migrations");
const DATABASE_URL = "postgresql://test:test@localhost:5437/codelab_new";

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
    const nodeModulesPath = path.join(import.meta.dir, "..", "node_modules");
    const env = {
      ...process.env,
      DATABASE_URL,
      NODE_PATH: nodeModulesPath,
      ...options.env,
    };
    const cliPath = path.join(import.meta.dir, "..", "dist", "cli.js");

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
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("PostgreSQL did not become ready in time");
}

/**
 * Clean up database
 */
async function cleanDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `;

  await tables.reduce(
    (promise, { tablename }) =>
      promise.then(() =>
        prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tablename}" CASCADE`),
      ),
    Promise.resolve(),
  );
}

beforeAll(async () => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });

  const { symlinkSync, cpSync } = require("fs");
  const parentNodeModules = path.join(import.meta.dir, "..", "node_modules");
  const testNodeModules = path.join(TEST_DIR, "node_modules");

  try {
    if (existsSync(testNodeModules)) {
      rmSync(testNodeModules, { recursive: true, force: true });
    }
    symlinkSync(parentNodeModules, testNodeModules, "dir");
  } catch (error) {
    cpSync(parentNodeModules, testNodeModules, { recursive: true });
  }

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

  const { execSync } = require("child_process");
  try {
    execSync("npx prisma generate", {
      cwd: TEST_DIR,
      env: { ...process.env, DATABASE_URL },
      stdio: "inherit",
    });
  } catch (error) {
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
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();

  // Cleanup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("Code Lab: New Project Setup", () => {
  describe("Step 1: Initialize Project", () => {
    it("should create a new Node.js project structure", async () => {
      writeFileSync(
        path.join(TEST_DIR, "package.json"),
        JSON.stringify(
          {
            name: "my-new-project",
            version: "1.0.0",
            type: "module",
            scripts: {
              migrate: "prisma-migrations",
            },
          },
          null,
          2,
        ),
      );

      expect(existsSync(path.join(TEST_DIR, "package.json"))).toBe(true);
    });
  });

  describe("Step 2: Setup Prisma", () => {
    it("should have Prisma schema file", async () => {
      const schemaPath = path.join(TEST_DIR, "prisma", "schema.prisma");
      expect(existsSync(schemaPath)).toBe(true);
    });

    it("should have generated Prisma client", async () => {
      expect(existsSync(path.join(TEST_DIR, "node_modules", ".prisma"))).toBe(
        true,
      );
    });
  });

  describe("Step 3: Initialize prisma-migrations", () => {
    it("should run prisma-migrations init", async () => {
      const result = await runCLI(["init"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Created migration");
      expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    });
  });

  describe("Step 4: Create First Migration - Users Table", () => {
    it("should create users table migration", async () => {
      const result = await runCLI(["create", "create_users_table"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("create_users_table");

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const files = require("fs").readdirSync(MIGRATIONS_DIR);
      const usersMigration = files.find((f: string) =>
        f.includes("create_users_table"),
      );

      expect(usersMigration).toBeTruthy();

      if (usersMigration) {
        const migrationFile = path.join(
          MIGRATIONS_DIR,
          usersMigration,
          "migration.ts",
        );
        writeFileSync(
          migrationFile,
          `import type { PrismaClient } from '@prisma/client';

/**
 * Create users table
 */
export async function up(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw\`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  \`;
}

/**
 * Drop users table
 */
export async function down(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw\`DROP TABLE IF EXISTS users CASCADE\`;
}
`,
        );
      }
    });
  });

  describe("Step 5: Create Second Migration - Posts Table", () => {
    it("should create posts table migration with foreign key", async () => {
      const result = await runCLI(["create", "create_posts_table"]);

      expect(result.code).toBe(0);

      const files = require("fs").readdirSync(MIGRATIONS_DIR);
      const postsMigration = files.find((f: string) =>
        f.includes("create_posts_table"),
      );

      expect(postsMigration).toBeTruthy();

      if (postsMigration) {
        const migrationFile = path.join(
          MIGRATIONS_DIR,
          postsMigration,
          "migration.ts",
        );
        writeFileSync(
          migrationFile,
          `import type { PrismaClient } from '@prisma/client';

/**
 * Create posts table with foreign key to users
 */
export async function up(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw\`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT false,
      author_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    )
  \`;

  await prisma.$executeRaw\`
    CREATE INDEX idx_posts_author_id ON posts(author_id)
  \`;
}

/**
 * Drop posts table
 */
export async function down(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw\`DROP TABLE IF EXISTS posts CASCADE\`;
}
`,
        );
      }
    });
  });

  describe("Step 6: Check Migration Status", () => {
    it("should show pending migrations", async () => {
      const result = await runCLI(["pending"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("pending migration");
    });

    it("should show overall status", async () => {
      const result = await runCLI(["status"]);

      expect(result.code).toBe(0);
    });
  });

  describe("Step 7: Run Migrations", () => {
    it("should run all pending migrations", async () => {
      const result = await runCLI(["up"]);

      expect(result.code).toBe(0);

      // Verify tables were created
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('users', 'posts')
        ORDER BY tablename
      `;

      expect(tables).toEqual([{ tablename: "posts" }, { tablename: "users" }]);
    });

    it("should verify foreign key constraint exists", async () => {
      const constraints = await prisma.$queryRaw<
        Array<{ constraint_name: string }>
      >`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'posts'
        AND constraint_type = 'FOREIGN KEY'
      `;

      expect(constraints.length).toBeGreaterThan(0);
    });
  });

  describe("Step 8: Test Data Operations", () => {
    it("should insert test data using raw SQL", async () => {
      // Insert a user
      await prisma.$executeRaw`
        INSERT INTO users (email, name)
        VALUES ('alice@example.com', 'Alice')
      `;

      // Get the user
      const users = await prisma.$queryRaw<
        Array<{ id: number; email: string }>
      >`
        SELECT id, email FROM users WHERE email = 'alice@example.com'
      `;

      expect(users.length).toBe(1);
      expect(users[0].email).toBe("alice@example.com");

      // Insert a post
      await prisma.$executeRaw`
        INSERT INTO posts (title, content, author_id)
        VALUES ('My First Post', 'Hello World!', ${users[0].id})
      `;

      // Verify post
      const posts = await prisma.$queryRaw<Array<{ title: string }>>`
        SELECT title FROM posts WHERE author_id = ${users[0].id}
      `;

      expect(posts.length).toBe(1);
      expect(posts[0].title).toBe("My First Post");
    });
  });

  describe("Step 9: Test Rollback", () => {
    it("should rollback last migration", async () => {
      const result = await runCLI(["down", "--steps", "1"]);

      expect(result.code).toBe(0);

      // Verify posts table was dropped
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'posts'
      `;

      expect(tables.length).toBe(0);
    });

    it("should re-run migration after rollback", async () => {
      const result = await runCLI(["up"]);

      expect(result.code).toBe(0);

      // Verify posts table exists again
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'posts'
      `;

      expect(tables.length).toBe(1);
    });
  });

  describe("Step 10: Verify Complete Setup", () => {
    it("should show all applied migrations", async () => {
      const result = await runCLI(["applied"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("applied migration");
    });

    it("should show latest migration", async () => {
      const result = await runCLI(["latest"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("create_posts_table");
    });
  });
});
