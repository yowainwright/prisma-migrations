import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MigrationManager } from "../src/migration-manager";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const _execAsync = promisify(exec);

describe("End-to-End Migration Tests", () => {
  const testDir = join(process.cwd(), "test-e2e-migrations");
  let manager: MigrationManager | null;

  beforeEach(async () => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      "postgresql://test_user:test_password@localhost:5432/test_db";

    try {
      manager = new MigrationManager();
      manager["config"].updateConfig({
        migrationsDir: testDir,
        tableName: "test_migrations",
      });
    } catch {
      manager = null;
    }
  });

  afterEach(async () => {
    try {
      if (manager) {
        await manager.destroy();
      }
    } catch {}

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("should create and run migrations like Knex.js", async () => {
    if (!manager) {
      console.log("Prisma client not available, skipping E2E test");
      return;
    }

    const isConnected = await manager.testConnection();
    if (!isConnected) {
      console.log("Database not available, skipping E2E test");
      return;
    }

    // 1. Create initial migration - create users table
    const migration1 = await manager.createMigration({
      name: "create_users_table",
      template: {
        up: `CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        down: `DROP TABLE users;`,
      },
    });

    console.log("✓ Created migration:", migration1.name);

    // 2. Create second migration - add posts table
    const migration2 = await manager.createMigration({
      name: "create_posts_table",
      template: {
        up: `CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT,
          user_id INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        down: `DROP TABLE posts;`,
      },
    });

    console.log("✓ Created migration:", migration2.name);

    // 3. Create third migration - add index
    const migration3 = await manager.createMigration({
      name: "add_user_email_index",
      template: {
        up: `CREATE INDEX idx_users_email ON users(email);`,
        down: `DROP INDEX idx_users_email;`,
      },
    });

    console.log("✓ Created migration:", migration3.name);

    // 4. Check initial status - should show 3 pending migrations
    let status = await manager.getMigrationStatus();
    console.log(
      "Initial status:",
      status.map((s) => `${s.name}: ${s.status}`),
    );

    const pendingCount = status.filter((s) => s.status === "pending").length;
    assert.strictEqual(pendingCount, 3, "Should have 3 pending migrations");

    // 5. Run all migrations up
    console.log("\n--- Running migrations up ---");
    const upResult = await manager.runMigrations();
    assert.strictEqual(
      upResult.success,
      true,
      "Migrations should run successfully",
    );
    assert.strictEqual(
      upResult.migrations.length,
      3,
      "Should apply 3 migrations",
    );

    console.log(
      "✓ Applied migrations:",
      upResult.migrations.map((m) => m.name),
    );

    // 6. Check status after running up - should show 3 applied migrations
    status = await manager.getMigrationStatus();
    console.log(
      "Status after up:",
      status.map((s) => `${s.name}: ${s.status}`),
    );

    const appliedCount = status.filter((s) => s.status === "applied").length;
    assert.strictEqual(appliedCount, 3, "Should have 3 applied migrations");

    // 7. Verify database state - check if tables exist
    await manager.initialize();
    try {
      // Check if tables exist by querying information_schema
      const dbAdapter = manager["dbAdapter"];

      // Check users table
      const usersTable = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      `) as any[];
      assert.strictEqual(usersTable.length, 1, "Users table should exist");

      // Check posts table
      const postsTable = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'posts'
      `) as any[];
      assert.strictEqual(postsTable.length, 1, "Posts table should exist");

      // Check index
      const indexExists = (await dbAdapter.prisma.$queryRaw`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'users' AND indexname = 'idx_users_email'
      `) as any[];
      assert.strictEqual(indexExists.length, 1, "Email index should exist");

      console.log("✓ Database state verified - all tables and indexes exist");
    } finally {
      await manager.destroy();
    }

    // 8. Test partial rollback - rollback last migration only
    console.log("\n--- Rolling back last migration ---");
    const rollbackResult = await manager.rollbackMigrations({ steps: 1 });
    assert.strictEqual(rollbackResult.success, true, "Rollback should succeed");
    assert.strictEqual(
      rollbackResult.migrations.length,
      1,
      "Should rollback 1 migration",
    );
    assert.strictEqual(
      rollbackResult.migrations[0].name,
      "add_user_email_index",
    );

    console.log("✓ Rolled back migration:", rollbackResult.migrations[0].name);

    // 9. Verify partial rollback - index should be gone, tables should remain
    await manager.initialize();
    try {
      const dbAdapter = manager["dbAdapter"];

      // Tables should still exist
      const usersTable = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      `) as any[];
      assert.strictEqual(
        usersTable.length,
        1,
        "Users table should still exist",
      );

      const postsTable = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'posts'
      `) as any[];
      assert.strictEqual(
        postsTable.length,
        1,
        "Posts table should still exist",
      );

      // Index should be gone
      const indexExists = (await dbAdapter.prisma.$queryRaw`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'users' AND indexname = 'idx_users_email'
      `) as any[];
      assert.strictEqual(
        indexExists.length,
        0,
        "Email index should be removed",
      );

      console.log("✓ Partial rollback verified - index removed, tables remain");
    } finally {
      await manager.destroy();
    }

    // 10. Test rollback to specific migration
    console.log("\n--- Rolling back to first migration ---");
    const rollbackToResult = await manager.rollbackMigrations({
      to: migration1.timestamp,
    });
    assert.strictEqual(
      rollbackToResult.success,
      true,
      "Rollback to specific migration should succeed",
    );
    assert.strictEqual(
      rollbackToResult.migrations.length,
      1,
      "Should rollback 1 more migration",
    );
    assert.strictEqual(
      rollbackToResult.migrations[0].name,
      "create_posts_table",
    );

    console.log("✓ Rolled back to migration:", migration1.name);

    // 11. Verify rollback to specific migration - only users table should exist
    await manager.initialize();
    try {
      const dbAdapter = manager["dbAdapter"];

      // Users table should exist
      const usersTable = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      `) as any[];
      assert.strictEqual(usersTable.length, 1, "Users table should exist");

      // Posts table should be gone
      const postsTable = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'posts'
      `) as any[];
      assert.strictEqual(postsTable.length, 0, "Posts table should be removed");

      console.log(
        "✓ Rollback to specific migration verified - only users table exists",
      );
    } finally {
      await manager.destroy();
    }

    // 12. Test full rollback
    console.log("\n--- Rolling back all migrations ---");
    await manager.rollbackMigrations({
      to: "initial",
    });

    // Since we can't rollback to 'initial' (it doesn't exist), let's rollback the remaining migration
    const finalRollbackResult = await manager.rollbackMigrations({ steps: 1 });
    assert.strictEqual(
      finalRollbackResult.success,
      true,
      "Final rollback should succeed",
    );

    console.log("✓ All migrations rolled back");

    // 13. Verify clean state
    await manager.initialize();
    try {
      const dbAdapter = manager["dbAdapter"];

      // No tables should exist
      const tables = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('users', 'posts')
      `) as any[];
      assert.strictEqual(
        tables.length,
        0,
        "No application tables should exist",
      );

      console.log("✓ Clean state verified - all application tables removed");
    } finally {
      await manager.destroy();
    }

    // 14. Test dry run functionality
    console.log("\n--- Testing dry run ---");
    const dryRunResult = await manager.runMigrations({ dryRun: true });
    assert.strictEqual(dryRunResult.success, true, "Dry run should succeed");
    assert.strictEqual(
      dryRunResult.migrations.length,
      3,
      "Dry run should show 3 migrations",
    );

    // Verify no actual changes were made
    await manager.initialize();
    try {
      const dbAdapter = manager["dbAdapter"];

      const tables = (await dbAdapter.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('users', 'posts')
      `) as any[];
      assert.strictEqual(tables.length, 0, "Dry run should not create tables");

      console.log("✓ Dry run verified - no actual changes made");
    } finally {
      await manager.destroy();
    }

    console.log("\n🎉 All end-to-end tests passed!");
  });

  test("should handle migration errors gracefully", async () => {
    if (!manager) {
      console.log("Prisma client not available, skipping error handling test");
      return;
    }

    const isConnected = await manager.testConnection();
    if (!isConnected) {
      console.log("Database not available, skipping error handling test");
      return;
    }

    // Create a migration with invalid SQL
    const invalidMigration = await manager.createMigration({
      name: "invalid_migration",
      template: {
        up: `INVALID SQL STATEMENT;`,
        down: `DROP TABLE nonexistent_table;`,
      },
    });

    console.log("✓ Created invalid migration:", invalidMigration.name);

    // Try to run the invalid migration
    const result = await manager.runMigrations();

    // Should fail gracefully
    assert.strictEqual(result.success, false, "Invalid migration should fail");
    assert.ok(result.error, "Should have error message");

    console.log("✓ Invalid migration handled gracefully:", result.error);

    // Verify no partial state was left behind
    const status = await manager.getMigrationStatus();
    const applied = status.filter((s) => s.status === "applied").length;
    assert.strictEqual(
      applied,
      0,
      "No migrations should be applied after failure",
    );

    console.log("✓ Error handling test passed");
  });
});
