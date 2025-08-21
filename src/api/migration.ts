import { logger } from "../utils/logger";

export interface PrismaClientLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (prisma: PrismaClientLike) => Promise<T>): Promise<T>;
  $connect?(): Promise<void>;
  $disconnect?(): Promise<void>;
  $queryRaw?<T = unknown>(
    sql: TemplateStringsArray | string,
    ...values: unknown[]
  ): Promise<T>;
}

export interface MigrationContext<TPrisma = PrismaClientLike> {
  prisma: TPrisma;

  sql: <T = unknown>(
    query: TemplateStringsArray | string,
    ...values: unknown[]
  ) => Promise<T>;

  execute: (
    query: TemplateStringsArray | string,
    ...values: unknown[]
  ) => Promise<number>;

  createTable: (tableName: string, definition: string) => string;

  dropTable: (tableName: string, ifExists?: boolean) => string;

  addColumn: (
    tableName: string,
    columnName: string,
    definition: string,
  ) => string;

  dropColumn: (tableName: string, columnName: string) => string;

  createIndex: (
    indexName: string,
    tableName: string,
    columns: string | string[],
    unique?: boolean,
  ) => string;

  dropIndex: (indexName: string, tableName?: string) => string;
}

export type MigrationFunction<TPrisma = PrismaClientLike> = (
  context: MigrationContext<TPrisma>,
) => Promise<void>;

export interface Migration<TPrisma = PrismaClientLike> {
  up: MigrationFunction<TPrisma>;
  down: MigrationFunction<TPrisma>;
}

export function createMigrationContext<
  TPrisma extends PrismaClientLike = PrismaClientLike,
>(prisma: TPrisma): MigrationContext<TPrisma> {
  return {
    prisma,

    sql: async <T = unknown>(
      query: TemplateStringsArray | string,
      ...values: unknown[]
    ): Promise<T> => {
      if (typeof query === "string") {
        logger.debug({ query }, "Executing raw SQL query");
        return await prisma.$queryRawUnsafe<T>(query);
      }

      const sql = query.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "");
      }, "");

      logger.debug({ sql, values }, "Executing parameterized SQL query");
      return await prisma.$queryRawUnsafe<T>(sql, ...values);
    },

    execute: async (
      query: TemplateStringsArray | string,
      ...values: unknown[]
    ): Promise<number> => {
      if (typeof query === "string") {
        logger.debug({ query }, "Executing raw SQL command");
        return await prisma.$executeRawUnsafe(query);
      }

      const sql = query.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "");
      }, "");

      logger.debug({ sql, values }, "Executing parameterized SQL command");
      return await prisma.$executeRawUnsafe(sql, ...values);
    },

    createTable: (tableName: string, definition: string): string => {
      return `CREATE TABLE ${tableName} (\n${definition}\n);`;
    },

    dropTable: (tableName: string, ifExists: boolean = true): string => {
      return `DROP TABLE ${ifExists ? "IF EXISTS " : ""}${tableName};`;
    },

    addColumn: (
      tableName: string,
      columnName: string,
      definition: string,
    ): string => {
      return `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`;
    },

    dropColumn: (tableName: string, columnName: string): string => {
      return `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`;
    },

    createIndex: (
      indexName: string,
      tableName: string,
      columns: string | string[],
      unique: boolean = false,
    ): string => {
      const columnList = Array.isArray(columns) ? columns.join(", ") : columns;
      return `CREATE ${unique ? "UNIQUE " : ""}INDEX ${indexName} ON ${tableName}(${columnList});`;
    },

    dropIndex: (indexName: string, tableName?: string): string => {
      if (tableName) {
        return `DROP INDEX ${indexName} ON ${tableName};`;
      }
      return `DROP INDEX ${indexName};`;
    },
  };
}

export function defineMigration<TPrisma = PrismaClientLike>(
  migration: Migration<TPrisma>,
): Migration<TPrisma> {
  return migration;
}

export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings.reduce((acc, str, i) => {
    const value = values[i];
    const escaped =
      value !== undefined
        ? typeof value === "string"
          ? `'${value.replace(/'/g, "''")}'`
          : String(value)
        : "";
    return acc + str + escaped;
  }, "");
}
