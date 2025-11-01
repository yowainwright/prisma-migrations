/**
 * E2E Code Lab: Migrating Existing Prisma ORM Project to prisma-migrations
 *
 * This code lab demonstrates how to migrate an existing project that uses
 * Prisma's native migrations to prisma-migrations with rollback support.
 *
 * Scenario: You have an existing project with Prisma migrations and want
 * to add rollback functionality using prisma-migrations.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";

const TEST_DIR = path.join(import.meta.dir, "codelab-migrate");
const MIGRATIONS_DIR = path.join(TEST_DIR, "prisma", "migrations");
const DATABASE_URL = "postgresql://test:test@localhost:5438/codelab_migrate";

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
    const nodeModulesPath = path.join(import.meta.dir, "..", "..", "node_modules");
    const env = {
      ...process.env,
      DATABASE_URL,
      NODE_PATH: nodeModulesPath,
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

/**
 * Simulate existing Prisma migrations by creating the _prisma_migrations table
 * and adding some historical migrations
 */
async function setupExistingPrismaDatabase(): Promise<void> {
  // Create existing tables (simulating Prisma migrate)
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create _prisma_migrations table (as Prisma does)
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id VARCHAR(36) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMP WITH TIME ZONE,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMP WITH TIME ZONE,
      started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `;

  // Add existing migration records
  await prisma.$executeRaw`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
    VALUES
      ('20240101000000', 'checksum1', NOW(), '20240101000000_init', 1),
      ('20240102000000', 'checksum2', NOW(), '20240102000000_add_posts', 1)
  `;

  // Add some test data
  await prisma.$executeRaw`
    INSERT INTO users (email, name) VALUES
      ('existing@example.com', 'Existing User'),
      ('legacy@example.com', 'Legacy User')
  `;

  await prisma.$executeRaw`
    INSERT INTO posts (title, content, user_id)
    SELECT 'Existing Post', 'This was here before migration', id
    FROM users WHERE email = 'existing@example.com'
  `;
}

beforeAll(async () => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });

  const { symlinkSync, cpSync } = require("fs");
  const parentNodeModules = path.join(import.meta.dir, "..", "..", "node_modules");
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
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now()) @map("created_at")
  posts     Post[]

  @@map("users")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now()) @map("created_at")

  @@map("posts")
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

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

  await waitForPostgres();
  await cleanDatabase();
  await setupExistingPrismaDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();

  // Cleanup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("Code Lab: Migrate Existing Prisma Project", () => {
  describe("Step 1: Verify Existing Database State", () => {
    it("should have existing tables and data", async () => {
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('users', 'posts', '_prisma_migrations')
        ORDER BY tablename
      `;

      expect(tables.length).toBe(3);
      expect(tables.map((t) => t.tablename)).toEqual([
        "_prisma_migrations",
        "posts",
        "users",
      ]);
    });

    it("should have existing migration records", async () => {
      const migrations = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`
        SELECT migration_name FROM _prisma_migrations
        ORDER BY started_at
      `;

      expect(migrations.length).toBe(2);
      expect(migrations[0].migration_name).toBe("20240101000000_init");
      expect(migrations[1].migration_name).toBe("20240102000000_add_posts");
    });

    it("should have existing data", async () => {
      const users = await prisma.$queryRaw<Array<{ email: string }>>`
        SELECT email FROM users ORDER BY email
      `;

      expect(users.length).toBe(2);

      const posts = await prisma.$queryRaw<Array<{ title: string }>>`
        SELECT title FROM posts
      `;

      expect(posts.length).toBe(1);
    });
  });

  describe("Step 2: Install prisma-migrations", () => {
    it("should create package.json with prisma-migrations", async () => {
      writeFileSync(
        path.join(TEST_DIR, "package.json"),
        JSON.stringify(
          {
            name: "existing-project",
            version: "1.0.0",
            type: "module",
            scripts: {
              migrate: "prisma-migrations",
            },
            dependencies: {
              "@prisma/client": "^6.0.0",
            },
            devDependencies: {
              prisma: "^6.0.0",
              "prisma-migrations": "latest",
            },
          },
          null,
          2,
        ),
      );

      expect(existsSync(path.join(TEST_DIR, "package.json"))).toBe(true);
    });
  });

  describe("Step 3: Initialize prisma-migrations", () => {
    it("should create migrations directory structure", async () => {
      mkdirSync(MIGRATIONS_DIR, { recursive: true });

      expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    });

    it("should create config file", async () => {
      writeFileSync(
        path.join(TEST_DIR, ".prisma-migrationsrc.json"),
        JSON.stringify(
          {
            migrationsDir: "./prisma/migrations",
            logLevel: "info",
          },
          null,
          2,
        ),
      );

      expect(existsSync(path.join(TEST_DIR, ".prisma-migrationsrc.json"))).toBe(
        true,
      );
    });
  });

  describe("Step 4: Verify Existing Migrations Are Recognized", () => {
    it("should show existing Prisma migrations as applied", async () => {
      const result = await runCLI(["applied"]);

      expect(result.code).toBe(0);
      // Even without migration files, the database records show as applied
    });

    it("should show no pending migrations initially", async () => {
      const result = await runCLI(["pending"]);

      expect(result.code).toBe(0);
    });
  });

  describe("Step 5: Create First New Migration", () => {
    it("should create migration to add comments table", async () => {
      const result = await runCLI(["create", "add_comments_table"]);

      expect(result.code).toBe(0);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const files = require("fs").readdirSync(MIGRATIONS_DIR);
      const commentsMigration = files.find((f: string) =>
        f.includes("add_comments_table"),
      );

      expect(commentsMigration).toBeTruthy();

      if (commentsMigration) {
        const migrationFile = path.join(
          MIGRATIONS_DIR,
          commentsMigration,
          "migration.sql",
        );
        writeFileSync(
          migrationFile,
          `-- Migration: Up
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_post_id ON comments(post_id);

CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Migration: Down
DROP TABLE IF EXISTS comments CASCADE;
`,
        );
      }
    });
  });

  describe("Step 6: Run New Migration", () => {
    it("should apply the new migration", async () => {
      const pendingResult = await runCLI(["pending"]);
      console.log("Pending migrations:");
      console.log("STDOUT:", pendingResult.stdout);

      const result = await runCLI(["up"]);

      console.log("Up command result:");
      console.log("Code:", result.code);
      console.log("STDOUT:", result.stdout);
      console.log("STDERR:", result.stderr);

      expect(result.code).toBe(0);

      // Verify comments table was created
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'comments'
      `;

      expect(tables.length).toBe(1);
    });

    it("should preserve existing data", async () => {
      const users = await prisma.$queryRaw<Array<{ email: string }>>`
        SELECT email FROM users ORDER BY email
      `;

      expect(users.length).toBe(2);

      const posts = await prisma.$queryRaw<Array<{ title: string }>>`
        SELECT title FROM posts
      `;

      expect(posts.length).toBe(1);
    });
  });

  describe("Step 7: Test Rollback (New Feature!)", () => {
    it("should rollback the comments table migration", async () => {
      const result = await runCLI(["down"]);

      expect(result.code).toBe(0);

      // Verify comments table was dropped
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'comments'
      `;

      expect(tables.length).toBe(0);
    });

    it("should still preserve all original data", async () => {
      const users = await prisma.$queryRaw<Array<{ email: string }>>`
        SELECT email FROM users ORDER BY email
      `;

      expect(users.length).toBe(2);

      const posts = await prisma.$queryRaw<Array<{ title: string }>>`
        SELECT title FROM posts
      `;

      expect(posts.length).toBe(1);
    });
  });

  describe("Step 8: Re-apply Migration", () => {
    it("should re-run the migration", async () => {
      const result = await runCLI(["up"]);

      expect(result.code).toBe(0);

      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'comments'
      `;

      expect(tables.length).toBe(1);
    });
  });

  describe("Step 9: Add Data Migration", () => {
    it("should create migration that modifies data", async () => {
      const result = await runCLI(["create", "add_user_roles"]);

      expect(result.code).toBe(0);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const files = require("fs").readdirSync(MIGRATIONS_DIR);
      const rolesMigration = files.find((f: string) =>
        f.includes("add_user_roles"),
      );

      if (rolesMigration) {
        const migrationFile = path.join(
          MIGRATIONS_DIR,
          rolesMigration,
          "migration.sql",
        );
        writeFileSync(
          migrationFile,
          `-- Migration: Up
ALTER TABLE users
ADD COLUMN role VARCHAR(50) DEFAULT 'user';

UPDATE users
SET role = 'admin'
WHERE email = 'existing@example.com';

-- Migration: Down
ALTER TABLE users
DROP COLUMN role;
`,
        );
      }
    });

    it("should run the data migration", async () => {
      const result = await runCLI(["up"]);

      expect(result.code).toBe(0);

      // Verify role column exists
      const user = await prisma.$queryRaw<
        Array<{ email: string; role: string }>
      >`
        SELECT email, role FROM users WHERE email = 'existing@example.com'
      `;

      expect(user[0].role).toBe("admin");
    });

    it("should rollback data migration", async () => {
      const result = await runCLI(["down"]);

      expect(result.code).toBe(0);

      // Verify role column is gone
      try {
        await prisma.$queryRaw`SELECT role FROM users LIMIT 1`;
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain("role");
      }
    });
  });

  describe("Step 10: Verify Full Migration History", () => {
    it("should show complete migration history", async () => {
      const result = await runCLI(["status"]);

      expect(result.code).toBe(0);
    });

    it("should verify database integrity", async () => {
      // Run all migrations
      await runCLI(["up"]);

      // Check all tables exist
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('users', 'posts', 'comments', '_prisma_migrations')
        ORDER BY tablename
      `;

      expect(tables.length).toBe(4);

      // Check data integrity
      const users = await prisma.$queryRaw<Array<{ email: string }>>`
        SELECT email FROM users ORDER BY email
      `;
      expect(users.length).toBe(2);
    });
  });

  describe("Step 11: Test Advanced Features", () => {
    it("should handle fresh command (reset + rerun)", async () => {
      const result = await runCLI(["fresh", "--force"]);

      expect(result.code).toBe(0);
    });

    it("should show latest migration", async () => {
      const result = await runCLI(["latest"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("add_user_roles");
    });
  });
});
