import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { splitSqlStatements } from "../../../../src/migrations/sql";

describe("SQL statement boundaries", () => {
  test.each([
    "CREATE TRIGGER audit AFTER INSERT ON widgets FOR EACH ROW EXECUTE FUNCTION begin()",
    "CREATE TRIGGER audit AFTER INSERT ON widgets FOR EACH ROW EXECUTE FUNCTION begin(update)",
    "CREATE TRIGGER begin AFTER INSERT ON widgets FOR EACH ROW EXECUTE FUNCTION audit_widget()",
    "CREATE TRIGGER audit AFTER INSERT ON begin FOR EACH ROW EXECUTE FUNCTION audit_widget()",
  ])("keeps BEGIN identifiers outside trigger bodies: %s", (trigger) => {
    const following = "ALTER TABLE widgets ADD COLUMN label TEXT";
    expect(splitSqlStatements(`${trigger}; ${following};`)).toEqual([
      trigger,
      following,
    ]);
  });

  test("ends PostgreSQL triggers before the following statement", () => {
    const trigger =
      "CREATE TRIGGER audit AFTER INSERT ON widgets FOR EACH ROW EXECUTE FUNCTION audit_widget()";
    const alter = "ALTER TABLE widgets ADD COLUMN label TEXT";
    expect(splitSqlStatements(`${trigger}; ${alter};`)).toEqual([
      trigger,
      alter,
    ]);
  });

  test("ends MySQL triggers without block bodies", () => {
    const trigger =
      "CREATE TRIGGER set_label BEFORE INSERT ON widgets FOR EACH ROW SET NEW.label = 'BEGIN'";
    const insert = "INSERT INTO widgets(id) VALUES(1)";
    expect(splitSqlStatements(`${trigger}; ${insert};`, true)).toEqual([
      trigger,
      insert,
    ]);
  });

  test("preserves SQLite trigger bodies", () => {
    const sql =
      "CREATE TABLE widgets(id INTEGER); CREATE TABLE audit(id INTEGER); CREATE TRIGGER log_widget AFTER INSERT ON widgets BEGIN /* body */ INSERT INTO audit VALUES(new.id); INSERT INTO audit VALUES(new.id + 1); END; INSERT INTO widgets VALUES(1);";
    const database = new Database(":memory:");
    try {
      splitSqlStatements(sql).forEach((statement) => database.run(statement));
      expect(database.query("SELECT id FROM audit ORDER BY id").all()).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
    } finally {
      database.close();
    }
  });

  test("keeps ordinary backslashes literal", () => {
    const sql = "SELECT 'c:\\'; SELECT 2;";
    expect(splitSqlStatements(sql)).toHaveLength(2);
  });

  test("supports MySQL backslash escapes", () => {
    const sql = "SELECT 'it\\'s; quoted'; SELECT 2;";
    expect(splitSqlStatements(sql, true)).toHaveLength(2);
  });

  test("supports PostgreSQL escape strings", () => {
    const sql = "SELECT E'it\\'s; quoted'; SELECT 2;";
    expect(splitSqlStatements(sql)).toHaveLength(2);
  });
});
