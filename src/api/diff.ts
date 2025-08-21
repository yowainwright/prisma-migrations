import {
  MigrationFile,
  Migration,
  MigrationChange,
  ColumnDetails,
} from "../utils/types";
import chalk from "chalk";
import sqlParser from "node-sql-parser";
import Table from "cli-table3";
import * as diff from "diff";

export class DiffGenerator {
  private parser: sqlParser.Parser;

  constructor() {
    const ParserClass =
      sqlParser.Parser || (sqlParser as any).default?.Parser || sqlParser;
    this.parser = new ParserClass();
  }

  public analyzeMigration(migration: MigrationFile): MigrationChange[] {
    const changes: MigrationChange[] = [];

    if (migration.type === "sql") {
      const upSection = this.extractUpSection(migration.content);
      const statements = this.splitStatements(upSection);

      for (const statement of statements) {
        const change = this.analyzeStatement(statement);
        if (change) {
          changes.push(change);
        }
      }
    } else {
      changes.push({
        type: "OTHER",
        object: "OTHER",
        target: migration.name,
        details: `${migration.type.toUpperCase()} migration`,
        sql: "",
      });
    }

    return changes;
  }

  private extractUpSection(content: string): string {
    const upMatch = content.match(/--\s*UP\s*\n([\s\S]*?)(?:--\s*DOWN|$)/i);
    return upMatch ? upMatch[1] : content;
  }

  private extractDownSection(content: string): string {
    const downMatch = content.match(/--\s*DOWN\s*\n([\s\S]*?)$/i);
    return downMatch ? downMatch[1] : "";
  }

  private splitStatements(sql: string): string[] {
    return sql
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.match(/^\s*--/));
  }

  private analyzeStatement(sql: string): MigrationChange | null {
    try {
      const ast = this.parser.astify(sql);

      if (!ast) return null;

      const astArray = Array.isArray(ast) ? ast : [ast];

      for (const node of astArray) {
        switch (node.type) {
          case "create":
            return this.analyzeCreate(node, sql);
          case "alter":
            return this.analyzeAlter(node, sql);
          case "drop":
            return this.analyzeDrop(node, sql);
          case "insert":
            return this.analyzeInsert(node, sql);
          case "update":
            return this.analyzeUpdate(node, sql);
          case "delete":
            return this.analyzeDelete(node, sql);
          default:
            return {
              type: "OTHER",
              object: "OTHER",
              details: node.type,
              sql: sql.substring(0, 100),
            };
        }
      }
    } catch (error) {
      return this.fallbackAnalysis(sql);
    }

    return null;
  }

  private analyzeCreate(node: any, sql: string): MigrationChange {
    const keyword = node.keyword || "table";
    const table = node.table?.[0]?.table || node.table?.name || "unknown";
    const columnChanges: ColumnDetails[] = [];

    if (keyword.toLowerCase() === "table" && node.create_definitions) {
      for (const def of node.create_definitions) {
        if (def.column && def.definition) {
          const column: ColumnDetails = {
            name: def.column.column || def.column,
            action: "ADD",
          };

          if (def.definition.dataType) {
            column.dataType = this.formatDataType(def.definition.dataType);
          }

          if (def.definition.nullable !== undefined) {
            column.nullable = def.definition.nullable;
          }

          if (def.definition.default_val) {
            column.defaultValue = this.formatDefaultValue(
              def.definition.default_val,
            );
          }

          const constraints: string[] = [];
          if (def.unique) constraints.push("UNIQUE");
          if (def.primary_key) constraints.push("PRIMARY KEY");
          if (def.auto_increment) constraints.push("AUTO_INCREMENT");

          if (constraints.length > 0) {
            column.constraints = constraints;
          }

          columnChanges.push(column);
        }
      }
    }

    let details = `Create ${keyword} ${table}`;
    if (columnChanges.length > 0) {
      details += ` with ${columnChanges.length} column${columnChanges.length === 1 ? "" : "s"}`;
    }

    return {
      type: "CREATE",
      object: keyword.toUpperCase() as any,
      target: table,
      details,
      sql,
      columnChanges: columnChanges.length > 0 ? columnChanges : undefined,
    };
  }

  private analyzeAlter(node: any, sql: string): MigrationChange {
    const table = node.table?.[0]?.table || "unknown";
    const columnChanges: ColumnDetails[] = [];

    if (node.expr && Array.isArray(node.expr)) {
      for (const expr of node.expr) {
        const columnDetail = this.extractColumnDetails(expr);
        if (columnDetail) {
          columnChanges.push(columnDetail);
        }
      }
    }

    const action = node.expr?.[0]?.action || "modify";
    let details = `Alter table ${table}`;

    if (columnChanges.length > 0) {
      const actions = columnChanges
        .map((col) => {
          if (col.action === "ADD") {
            return `ADD COLUMN ${col.name} ${col.dataType || "unknown"}${col.nullable === false ? " NOT NULL" : ""}${col.defaultValue ? ` DEFAULT ${col.defaultValue}` : ""}`;
          } else if (col.action === "DROP") {
            return `DROP COLUMN ${col.name}`;
          } else if (col.action === "MODIFY") {
            return `MODIFY COLUMN ${col.name} ${col.newType || col.dataType || "unknown"}`;
          } else if (col.action === "RENAME") {
            return `RENAME COLUMN ${col.name}`;
          }
          return `${col.action || action} ${col.name}`;
        })
        .join(", ");
      details = `${details}: ${actions}`;
    } else {
      details = `${details} (${action})`;
    }

    return {
      type: "ALTER",
      object: columnChanges.length > 0 ? "COLUMN" : "TABLE",
      target: table,
      details,
      sql,
      columnChanges: columnChanges.length > 0 ? columnChanges : undefined,
    };
  }

  private analyzeDrop(node: any, sql: string): MigrationChange {
    const keyword = node.keyword || "table";
    const table = node.name?.[0]?.table || node.table?.[0]?.table || "unknown";

    return {
      type: "DROP",
      object: keyword.toUpperCase() as any,
      target: table,
      details: `Drop ${keyword} ${table}`,
      sql,
    };
  }

  private analyzeInsert(node: any, sql: string): MigrationChange {
    const table = node.table?.[0]?.table || "unknown";
    const valueCount = node.values?.[0]?.value?.length || 0;

    return {
      type: "INSERT",
      object: "DATA",
      target: table,
      details: `Insert ${valueCount} value(s) into ${table}`,
      sql,
    };
  }

  private analyzeUpdate(node: any, sql: string): MigrationChange {
    const table = node.table?.[0]?.table || "unknown";

    return {
      type: "UPDATE",
      object: "DATA",
      target: table,
      details: `Update data in ${table}`,
      sql,
    };
  }

  private analyzeDelete(node: any, sql: string): MigrationChange {
    const table = node.from?.[0]?.table || "unknown";

    return {
      type: "DELETE",
      object: "DATA",
      target: table,
      details: `Delete data from ${table}`,
      sql,
    };
  }

  private extractColumnDetails(expr: any): ColumnDetails | null {
    if (!expr) return null;

    const action = expr.action?.toUpperCase();
    const column: ColumnDetails = {
      name: "",
      action: action as any,
    };

    if (expr.column) {
      column.name =
        typeof expr.column === "string"
          ? expr.column
          : expr.column.column || "";
    }

    if (expr.definition) {
      const def = expr.definition;

      if (def.dataType) {
        column.dataType = this.formatDataType(def.dataType);
      }

      if (def.nullable !== undefined) {
        column.nullable = def.nullable;
      }

      if (def.default_val) {
        column.defaultValue = this.formatDefaultValue(def.default_val);
      }

      const constraints: string[] = [];
      if (def.unique) constraints.push("UNIQUE");
      if (def.primary_key) constraints.push("PRIMARY KEY");
      if (def.foreign_key) constraints.push("FOREIGN KEY");
      if (def.check) constraints.push("CHECK");

      if (constraints.length > 0) {
        column.constraints = constraints;
      }
    }

    if (action === "MODIFY" && expr.old_column) {
      column.previousType = expr.old_column.dataType
        ? this.formatDataType(expr.old_column.dataType)
        : undefined;
      column.newType = column.dataType;
    }

    if (action === "RENAME") {
      column.name = expr.old_column?.column || column.name;
      column.newType = expr.new_column?.column || "";
    }

    return column.name ? column : null;
  }

  private formatDataType(dataType: any): string {
    if (typeof dataType === "string") return dataType;

    if (dataType.dataType) {
      let type = dataType.dataType;
      if (dataType.length) {
        type += `(${dataType.length})`;
      } else if (dataType.precision && dataType.scale) {
        type += `(${dataType.precision}, ${dataType.scale})`;
      }
      return type;
    }

    return JSON.stringify(dataType);
  }

  private formatDefaultValue(defaultVal: any): string {
    if (typeof defaultVal === "string") return defaultVal;
    if (defaultVal.value !== undefined) return String(defaultVal.value);
    if (defaultVal.type === "function") return defaultVal.name || "function";
    return JSON.stringify(defaultVal);
  }

  private fallbackAnalysis(sql: string): MigrationChange {
    const upperSQL = sql.toUpperCase();
    const columnChanges: ColumnDetails[] = [];

    const addColumnMatch = sql.match(
      /ADD\s+(?:COLUMN\s+)?([\w_]+)\s+([\w(),\s]+?)(?=\s+(?:NOT\s+)?NULL|\s+DEFAULT|\s+PRIMARY|\s+UNIQUE|\s+AUTO_INCREMENT|,|;|$)([^,;]*)/gi,
    );
    if (addColumnMatch) {
      for (const match of addColumnMatch) {
        const parts = match.match(
          /ADD\s+(?:COLUMN\s+)?([\w_]+)\s+([\w(),\s]+?)(?:\s+(.*))?$/i,
        );
        if (parts) {
          const column: ColumnDetails = {
            name: parts[1],
            dataType: parts[2].trim(),
            action: "ADD",
          };

          const rest = parts[3] || "";
          if (rest.includes("NOT NULL")) column.nullable = false;
          else if (rest.includes("NULL") && !rest.includes("NOT"))
            column.nullable = true;

          const defaultMatch = rest.match(
            /DEFAULT\s+(?:'([^']*)'|"([^"]*)"|(\S+))/i,
          );
          if (defaultMatch) {
            column.defaultValue =
              defaultMatch[1] || defaultMatch[2] || defaultMatch[3];
          }

          const constraints: string[] = [];
          if (rest.includes("PRIMARY KEY")) constraints.push("PRIMARY KEY");
          if (rest.includes("UNIQUE")) constraints.push("UNIQUE");
          if (rest.includes("AUTO_INCREMENT"))
            constraints.push("AUTO_INCREMENT");
          if (constraints.length > 0) column.constraints = constraints;

          columnChanges.push(column);
        }
      }
    }

    const dropColumnMatch = sql.match(/DROP\s+(?:COLUMN\s+)?([\w_]+)/gi);
    if (dropColumnMatch) {
      for (const match of dropColumnMatch) {
        const parts = match.match(/DROP\s+(?:COLUMN\s+)?([\w_]+)/i);
        if (parts) {
          columnChanges.push({
            name: parts[1],
            action: "DROP",
          });
        }
      }
    }

    const modifyColumnMatch = sql.match(
      /(?:MODIFY|ALTER)\s+(?:COLUMN\s+)?([\w_]+)\s+([\w(),\s]+?)(?=\s+(?:NOT\s+)?NULL|\s+DEFAULT|\s+PRIMARY|\s+UNIQUE|,|;|$)([^,;]*)/gi,
    );
    if (modifyColumnMatch) {
      for (const match of modifyColumnMatch) {
        const parts = match.match(
          /(?:MODIFY|ALTER)\s+(?:COLUMN\s+)?([\w_]+)\s+([\w(),\s]+?)(?:\s+(.*))?$/i,
        );
        if (parts) {
          const column: ColumnDetails = {
            name: parts[1],
            dataType: parts[2].trim(),
            action: "MODIFY",
          };

          const rest = parts[3] || "";
          if (rest.includes("NOT NULL")) column.nullable = false;
          else if (rest.includes("NULL") && !rest.includes("NOT"))
            column.nullable = true;

          const defaultMatch = rest.match(
            /DEFAULT\s+(?:'([^']*)'|"([^"]*)"|(\S+))/i,
          );
          if (defaultMatch) {
            column.defaultValue =
              defaultMatch[1] || defaultMatch[2] || defaultMatch[3];
          }

          columnChanges.push(column);
        }
      }
    }

    if (upperSQL.includes("CREATE TABLE")) {
      return {
        type: "CREATE",
        object: "TABLE",
        details: "Create table",
        sql,
      };
    }

    if (upperSQL.includes("ALTER TABLE")) {
      let details = "Alter table";
      if (columnChanges.length > 0) {
        const actions = columnChanges
          .map((col) => `${col.action} ${col.name}`)
          .join(", ");
        details = `Alter table: ${actions}`;
      }

      return {
        type: "ALTER",
        object: columnChanges.length > 0 ? "COLUMN" : "TABLE",
        details,
        sql,
        columnChanges: columnChanges.length > 0 ? columnChanges : undefined,
      };
    }

    if (upperSQL.includes("DROP TABLE")) {
      return {
        type: "DROP",
        object: "TABLE",
        details: "Drop table",
        sql,
      };
    }

    return {
      type: "OTHER",
      object: "OTHER",
      details: "SQL statement",
      sql: sql.substring(0, 100),
    };
  }

  public formatDiff(
    migrationFile: MigrationFile,
    direction: "up" | "down" = "up",
  ): string {
    const changes = this.analyzeMigration(migrationFile);
    const output: string[] = [];

    output.push(chalk.bold.blue(`\n🔄 Migration: ${migrationFile.name}`));
    output.push(chalk.gray(`File: ${migrationFile.path}`));
    output.push(chalk.gray(`Type: ${migrationFile.type.toUpperCase()}`));
    output.push(chalk.gray(`Direction: ${direction.toUpperCase()}`));

    if (changes.length === 0) {
      output.push(chalk.yellow("\nNo changes detected"));
      return output.join("\n");
    }

    const table = new Table({
      head: ["#", "Type", "Object", "Target", "Description"],
      style: {
        head: ["cyan"],
      },
    });

    changes.forEach((change, i) => {
      table.push([
        (i + 1).toString(),
        this.colorizeType(change.type),
        change.object,
        change.target || "-",
        change.details || "-",
      ]);
    });

    output.push("\n" + table.toString());

    const columnsWithChanges = changes.filter(
      (c) => c.columnChanges && c.columnChanges.length > 0,
    );
    if (columnsWithChanges.length > 0) {
      output.push("\n" + chalk.bold.cyan("📊 Column Details:"));

      for (const change of columnsWithChanges) {
        if (!change.columnChanges) continue;

        output.push(chalk.gray(`\n  Table: ${change.target}`));

        const columnTable = new Table({
          head: [
            "Action",
            "Column",
            "Type",
            "Nullable",
            "Default",
            "Constraints",
          ],
          style: {
            head: ["cyan"],
          },
        });

        for (const col of change.columnChanges) {
          const actionColor = this.getColumnActionColor(col.action);
          const action = actionColor(col.action || "CHANGE");

          let typeInfo = col.dataType || "-";
          if (col.action === "MODIFY" && col.previousType && col.newType) {
            typeInfo = `${col.previousType} → ${col.newType}`;
          } else if (col.action === "RENAME" && col.newType) {
            typeInfo = `${col.name} → ${col.newType}`;
          }

          columnTable.push([
            action,
            col.name,
            typeInfo,
            col.nullable === true ? "✓" : col.nullable === false ? "✗" : "-",
            col.defaultValue || "-",
            col.constraints ? col.constraints.join(", ") : "-",
          ]);
        }

        output.push(columnTable.toString());
      }
    }

    return output.join("\n");
  }

  private colorizeType(type: MigrationChange["type"]): string {
    switch (type) {
      case "CREATE":
        return chalk.green(type);
      case "ALTER":
        return chalk.yellow(type);
      case "DROP":
        return chalk.red(type);
      case "INSERT":
        return chalk.cyan(type);
      case "UPDATE":
        return chalk.yellow(type);
      case "DELETE":
        return chalk.red(type);
      default:
        return chalk.gray(type);
    }
  }

  private getColumnActionColor(action?: string): (text: string) => string {
    switch (action) {
      case "ADD":
        return chalk.green;
      case "DROP":
        return chalk.red;
      case "MODIFY":
        return chalk.yellow;
      case "RENAME":
        return chalk.blue;
      default:
        return chalk.gray;
    }
  }

  public showSQLDiff(
    migration: MigrationFile,
    options: { context?: number; color?: boolean } = {},
  ): string {
    const { context = 3, color = true } = options;

    if (migration.type !== "sql") {
      return chalk.gray("No SQL diff available for non-SQL migrations");
    }

    const upSection = this.extractUpSection(migration.content);
    const downSection = this.extractDownSection(migration.content);

    if (!downSection) {
      return this.formatSQL(upSection, "up");
    }

    const changes = diff.diffLines(downSection, upSection, {
      ignoreWhitespace: false,
    });
    const output: string[] = [];

    output.push(chalk.bold("\n📝 SQL Diff (DOWN → UP)"));
    output.push("");

    for (const change of changes) {
      const lines = change.value.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (change.added) {
          output.push(color ? chalk.green("+ " + line) : "+ " + line);
        } else if (change.removed) {
          output.push(color ? chalk.red("- " + line) : "- " + line);
        } else if (context > 0) {
          output.push(color ? chalk.gray("  " + line) : "  " + line);
        }
      }
    }

    return output.join("\n");
  }

  private formatSQL(sql: string, direction: string): string {
    const lines = sql.split("\n").filter((line) => line.trim());
    const output: string[] = [];

    output.push(chalk.bold(`\n📝 SQL (${direction.toUpperCase()})`));
    output.push("");

    for (const line of lines) {
      output.push(chalk.gray("  " + line));
    }

    return output.join("\n");
  }

  public formatMigrationSummary(migrations: MigrationFile[]): string {
    const table = new Table({
      head: ["#", "Timestamp", "Name", "Type", "Changes"],
      style: {
        head: ["cyan"],
      },
    });

    migrations.forEach((migration, i) => {
      const changes = this.analyzeMigration(migration);
      const summary = this.summarizeChanges(changes);

      table.push([
        (i + 1).toString(),
        migration.timestamp,
        migration.name,
        migration.type.toUpperCase(),
        summary,
      ]);
    });

    return "\n" + chalk.bold("📋 Migration Summary") + "\n" + table.toString();
  }

  private summarizeChanges(changes: MigrationChange[]): string {
    const counts: Record<string, number> = {};

    for (const change of changes) {
      const key = `${change.type}_${change.object}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    const parts: string[] = [];

    Object.entries(counts).forEach(([key, count]) => {
      const [type, object] = key.split("_");
      parts.push(`${count} ${type.toLowerCase()} ${object.toLowerCase()}`);
    });

    return parts.join(", ") || "No changes";
  }

  public compareAppliedWithPending(
    applied: Migration[],
    pending: MigrationFile[],
  ): string {
    const table = new Table({
      head: ["Status", "Timestamp", "Name", "Applied At"],
      style: {
        head: ["cyan"],
      },
    });

    for (const migration of applied) {
      table.push([
        chalk.green("✓ Applied"),
        migration.timestamp.toISOString().split("T")[0],
        migration.name,
        migration.appliedAt?.toISOString().split("T")[0] || "-",
      ]);
    }

    for (const migration of pending) {
      table.push([
        chalk.yellow("⧗ Pending"),
        migration.timestamp,
        migration.name,
        "-",
      ]);
    }

    return "\n" + chalk.bold("📊 Migration Status") + "\n" + table.toString();
  }
}
