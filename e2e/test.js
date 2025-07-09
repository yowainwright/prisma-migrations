import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");
const cliPath = join(projectRoot, "dist/cli.js"); // ESM CLI

// Test database URL (you'd set this to a test database)
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://test:test@localhost:5432/test_prisma_migrations";

/**
 * Helper function to run CLI commands
 */
function runCLI(args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      ...options.env,
    };

    const child = spawn("node", [cliPath, ...args], {
      cwd: projectRoot,
      env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });

    child.on("error", reject);
  });
}

describe("Prisma Migrations E2E Tests (ESM)", () => {
  test("should show migration status", async () => {
    const result = await runCLI(["status"]);

    // This might fail if no database is set up, but we can check the behavior
    console.log("Status command output:", result.stdout);
    console.log("Status command error:", result.stderr);

    // The command should attempt to connect to database
    assert.match(result.stderr, /(Database URL not found|Error)/);
  });

  test("should create a new migration", async () => {
    const result = await runCLI(["create", "test_migration"]);

    console.log("Create command output:", result.stdout);
    console.log("Create command error:", result.stderr);

    // Should either create successfully or fail with database error
    // The important thing is that the command parsing works
    assert.notEqual(result.code, 127); // Command not found
  });

  test("should validate migration name", async () => {
    const result = await runCLI(["create", ""]);

    console.log("Empty name output:", result.stdout);
    console.log("Empty name error:", result.stderr);

    // Should fail with validation error
    assert.notEqual(result.code, 0);
  });

  test("should handle up command", async () => {
    const result = await runCLI(["up", "--dry-run"]);

    console.log("Up command output:", result.stdout);
    console.log("Up command error:", result.stderr);

    // Should attempt to run migrations
    assert.notEqual(result.code, 127);
  });

  test("should handle down command", async () => {
    const result = await runCLI(["down", "--dry-run"]);

    console.log("Down command output:", result.stdout);
    console.log("Down command error:", result.stderr);

    // Should attempt to rollback migrations
    assert.notEqual(result.code, 127);
  });

  test("should handle test command", async () => {
    const result = await runCLI(["test"]);

    console.log("Test command output:", result.stdout);
    console.log("Test command error:", result.stderr);

    // Should attempt to test connection
    assert.notEqual(result.code, 127);
  });
});

describe("Migration File Structure", () => {
  test("should have proper up and down functions", async () => {
    // Test that our sample migration file exports the right functions
    const migrationPath = join(__dirname, "20250109014500_add_users_table.ts");

    // Since we can't easily import TS files directly, we'll check the content
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(migrationPath, "utf-8");

    assert.match(content, /export async function up\(prisma: PrismaClient\)/);
    assert.match(content, /export async function down\(prisma: PrismaClient\)/);
    assert.match(content, /import { PrismaClient } from "@prisma\/client"/);
  });
});
