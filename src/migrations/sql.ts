import { readFile } from "fs/promises";
import type { DiscoveredMigration } from "./discovery";

const DOLLAR_QUOTE_TAG_PATTERN = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_PATTERN = /^\s*--.*$/gm;
const UP_MARKER = "-- Migration: Up";
const DOWN_MARKER = "-- Migration: Down";

type Direction = "up" | "down";
type SqlResult = Promise<string>;
type StatementResult = Promise<string[]>;

function parseLegacyMigration(sql: string, direction: Direction): string {
  const upIndex = sql.indexOf(UP_MARKER);
  const downIndex = sql.indexOf(DOWN_MARKER);
  const hasInvalidMarkers = upIndex < 0 || downIndex <= upIndex;
  if (hasInvalidMarkers)
    throw new Error("Legacy migration markers are invalid");
  if (direction === "up") {
    return sql.slice(upIndex + UP_MARKER.length, downIndex).trim();
  }
  return sql.slice(downIndex + DOWN_MARKER.length).trim();
}

function hasExecutableSql(sql: string): boolean {
  const withoutBlockComments = sql.replace(BLOCK_COMMENT_PATTERN, "");
  const withoutComments = withoutBlockComments.replace(
    LINE_COMMENT_PATTERN,
    "",
  );
  return withoutComments.trim().length > 0;
}

class SqlSplitter {
  private statements: string[] = [];
  private statementStart = 0;
  private index = 0;
  private singleQuoted = false;
  private doubleQuoted = false;
  private backtickQuoted = false;
  private lineComment = false;
  private blockComment = false;
  private dollarQuoteTag: string | null = null;

  constructor(private readonly sql: string) {}

  split(): string[] {
    while (this.index < this.sql.length) {
      this.scanCurrentCharacter();
    }
    this.appendStatement(this.sql.slice(this.statementStart));
    return this.statements;
  }

  private scanCurrentCharacter(): void {
    if (this.consumeLineComment()) return;
    if (this.consumeBlockComment()) return;
    if (this.consumeDollarQuote()) return;
    if (this.consumeSingleQuote()) return;
    if (this.consumeIdentifierQuote()) return;
    if (this.startComment()) return;
    if (this.startQuote()) return;
    if (this.startDollarQuote()) return;
    this.consumeCharacter();
  }

  private consumeLineComment(): boolean {
    if (!this.lineComment) return false;
    if (this.current === "\n") this.lineComment = false;
    this.index++;
    return true;
  }

  private consumeBlockComment(): boolean {
    if (!this.blockComment) return false;
    const isCommentEnd = this.current === "*" && this.next === "/";
    if (isCommentEnd) {
      this.blockComment = false;
      this.index += 2;
      return true;
    }
    this.index++;
    return true;
  }

  private consumeDollarQuote(): boolean {
    if (!this.dollarQuoteTag) return false;
    const isQuoteEnd = this.sql.startsWith(this.dollarQuoteTag, this.index);
    if (isQuoteEnd) {
      this.index += this.dollarQuoteTag.length;
      this.dollarQuoteTag = null;
      return true;
    }
    this.index++;
    return true;
  }

  private consumeSingleQuote(): boolean {
    if (!this.singleQuoted) return false;
    const isEscaped = this.current === "\\" && Boolean(this.next);
    const isDoubled = this.current === "'" && this.next === "'";
    if (isEscaped || isDoubled) {
      this.index += 2;
      return true;
    }
    if (this.current === "'") this.singleQuoted = false;
    this.index++;
    return true;
  }

  private consumeIdentifierQuote(): boolean {
    const hasIdentifierQuote = this.doubleQuoted || this.backtickQuoted;
    if (!hasIdentifierQuote) return false;
    const quote = this.doubleQuoted ? '"' : "`";
    const isDoubled = this.current === quote && this.next === quote;
    if (isDoubled) {
      this.index += 2;
      return true;
    }
    if (this.current === quote) this.endIdentifierQuote();
    this.index++;
    return true;
  }

  private endIdentifierQuote(): void {
    this.doubleQuoted = false;
    this.backtickQuoted = false;
  }

  private startComment(): boolean {
    const isLineComment = this.current === "-" && this.next === "-";
    const isBlockComment = this.current === "/" && this.next === "*";
    if (!isLineComment && !isBlockComment) return false;
    this.lineComment = isLineComment;
    this.blockComment = isBlockComment;
    this.index += 2;
    return true;
  }

  private startQuote(): boolean {
    const isQuote = ["'", '"', "`"].includes(this.current);
    if (!isQuote) return false;
    this.singleQuoted = this.current === "'";
    this.doubleQuoted = this.current === '"';
    this.backtickQuoted = this.current === "`";
    this.index++;
    return true;
  }

  private startDollarQuote(): boolean {
    if (this.current !== "$") return false;
    const match = this.sql.slice(this.index).match(DOLLAR_QUOTE_TAG_PATTERN);
    if (!match) return false;
    this.dollarQuoteTag = match[0];
    this.index += this.dollarQuoteTag.length;
    return true;
  }

  private consumeCharacter(): void {
    if (this.current === ";") {
      const statement = this.sql.slice(this.statementStart, this.index);
      this.appendStatement(statement);
      this.statementStart = this.index + 1;
    }
    this.index++;
  }

  private appendStatement(statement: string): void {
    const trimmed = statement.trim();
    if (hasExecutableSql(trimmed)) this.statements.push(trimmed);
  }

  private get current(): string {
    return this.sql[this.index];
  }

  private get next(): string {
    return this.sql[this.index + 1];
  }
}

export function splitSqlStatements(sql: string): string[] {
  return new SqlSplitter(sql).split();
}

async function readDirectionalSql(
  migration: DiscoveredMigration,
  direction: Direction,
): SqlResult {
  const upSql = await readFile(migration.path, "utf-8");
  if (migration.format === "legacy") {
    return parseLegacyMigration(upSql, direction);
  }
  if (direction === "up") return upSql;
  if (!migration.downPath) return "";
  return readFile(migration.downPath, "utf-8");
}

export async function loadMigrationStatements(
  migration: DiscoveredMigration,
  direction: Direction,
): StatementResult {
  const sql = await readDirectionalSql(migration, direction);
  const statements = splitSqlStatements(sql);
  if (statements.length > 0) return statements;
  const migrationName = `${migration.id}_${migration.name}`;
  const kind = direction === "up" ? "forward" : "rollback";
  throw new Error(
    `Migration ${migrationName} does not have executable ${kind} SQL`,
  );
}
