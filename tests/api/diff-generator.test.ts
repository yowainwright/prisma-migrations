import { test, describe } from "node:test";
import assert from "node:assert";
import { DiffGenerator } from "../../src/api/diff";
import { MigrationFile } from "../../src/utils/types";

describe("DiffGenerator", () => {
  let diffGenerator: DiffGenerator;

  test("should create DiffGenerator instance", () => {
    diffGenerator = new DiffGenerator();
    assert.ok(diffGenerator instanceof DiffGenerator);
  });

  test("should analyze CREATE TABLE migration", () => {
    diffGenerator = new DiffGenerator();
    const migration: MigrationFile = {
      path: "./test.sql",
      content: `-- UP
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- DOWN
DROP TABLE users;`,
      timestamp: "20240120120000",
      name: "create_users_table",
      type: "sql",
    };

    const changes = diffGenerator.analyzeMigration(migration);
    
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].type, "CREATE");
    assert.strictEqual(changes[0].object, "TABLE");
    assert.strictEqual(changes[0].target, "users");
    assert.ok(changes[0].columnChanges);
    assert.strictEqual(changes[0].columnChanges.length, 4);
    
    const idColumn = changes[0].columnChanges.find(c => c.name === "id");
    assert.ok(idColumn);
    assert.strictEqual(idColumn.action, "ADD");
    assert.ok(idColumn.constraints?.includes("PRIMARY KEY"));
  });

  test("should analyze ALTER TABLE with column changes", () => {
    diffGenerator = new DiffGenerator();
    const migration: MigrationFile = {
      path: "./test.sql",
      content: `-- UP
ALTER TABLE users 
  ADD COLUMN age INT NOT NULL DEFAULT 18,
  ADD COLUMN bio TEXT,
  DROP COLUMN old_field,
  MODIFY COLUMN email VARCHAR(500) NOT NULL;
-- DOWN
ALTER TABLE users
  DROP COLUMN age,
  DROP COLUMN bio,
  ADD COLUMN old_field VARCHAR(50),
  MODIFY COLUMN email VARCHAR(255) NOT NULL;`,
      timestamp: "20240120120001",
      name: "alter_users_table",
      type: "sql",
    };

    const changes = diffGenerator.analyzeMigration(migration);
    
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].type, "ALTER");
    assert.strictEqual(changes[0].object, "COLUMN");
    assert.strictEqual(changes[0].target, "users");
    assert.ok(changes[0].columnChanges);
    assert.strictEqual(changes[0].columnChanges.length, 4);
    
    const ageColumn = changes[0].columnChanges.find(c => c.name === "age");
    assert.ok(ageColumn);
    assert.strictEqual(ageColumn.action, "ADD");
    assert.ok(ageColumn.dataType.includes("INT"));
    
    const dropColumn = changes[0].columnChanges.find(c => c.name === "old_field");
    assert.ok(dropColumn);
    assert.strictEqual(dropColumn.action, "DROP");
    
    const modifyColumn = changes[0].columnChanges.find(c => c.name === "email");
    assert.ok(modifyColumn);
    assert.strictEqual(modifyColumn.action, "MODIFY");
    assert.ok(modifyColumn.dataType.includes("VARCHAR"));
  });

  test("should format diff output with column details", () => {
    diffGenerator = new DiffGenerator();
    const migration: MigrationFile = {
      path: "./test.sql",
      content: `-- UP
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00
);`,
      timestamp: "20240120120002",
      name: "create_products_table",
      type: "sql",
    };

    const diff = diffGenerator.formatDiff(migration, "up");
    
    assert.ok(diff.includes("Migration: create_products_table"));
    assert.ok(diff.includes("CREATE"));
    assert.ok(diff.includes("TABLE"));
    assert.ok(diff.includes("products"));
    assert.ok(diff.includes("Column Details"));
    assert.ok(diff.includes("PRIMARY KEY"));
    assert.ok(diff.includes("AUTO_INCREMENT"));
  });

  test("should handle non-SQL migrations", () => {
    diffGenerator = new DiffGenerator();
    const migration: MigrationFile = {
      path: "./test.js",
      content: `exports.up = async (prisma) => {
  // JavaScript migration
};`,
      timestamp: "20240120120003",
      name: "js_migration",
      type: "js",
    };

    const changes = diffGenerator.analyzeMigration(migration);
    
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].type, "OTHER");
    assert.strictEqual(changes[0].object, "OTHER");
    assert.strictEqual(changes[0].target, "js_migration");
  });

  test("should handle multiple SQL statements", () => {
    diffGenerator = new DiffGenerator();
    const migration: MigrationFile = {
      path: "./test.sql",
      content: `-- UP
CREATE TABLE posts (
  id INT PRIMARY KEY,
  title VARCHAR(255)
);

CREATE INDEX idx_posts_title ON posts(title);

ALTER TABLE users ADD COLUMN post_count INT DEFAULT 0;`,
      timestamp: "20240120120004",
      name: "multiple_statements",
      type: "sql",
    };

    const changes = diffGenerator.analyzeMigration(migration);
    
    assert.ok(changes.length >= 2);
    
    const createTable = changes.find(c => c.type === "CREATE" && c.object === "TABLE");
    assert.ok(createTable);
    assert.strictEqual(createTable.target, "posts");
    
    const alterTable = changes.find(c => c.type === "ALTER");
    assert.ok(alterTable);
    assert.strictEqual(alterTable.target, "users");
  });

  test("should format migration summary", () => {
    diffGenerator = new DiffGenerator();
    const migrations: MigrationFile[] = [
      {
        path: "./test1.sql",
        content: "CREATE TABLE test1 (id INT);",
        timestamp: "20240120120005",
        name: "create_test1",
        type: "sql",
      },
      {
        path: "./test2.sql",
        content: "ALTER TABLE test1 ADD COLUMN name VARCHAR(50);",
        timestamp: "20240120120006",
        name: "alter_test1",
        type: "sql",
      },
    ];

    const summary = diffGenerator.formatMigrationSummary(migrations);
    
    assert.ok(summary.includes("Migration Summary"));
    assert.ok(summary.includes("create_test1"));
    assert.ok(summary.includes("alter_test1"));
    assert.ok(summary.includes("20240120120005"));
    assert.ok(summary.includes("20240120120006"));
  });
});