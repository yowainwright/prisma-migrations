export interface PrismaClient {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $raw(value: string): unknown;
  $disconnect(): Promise<void>;
}

export type MigrationFunction = (prisma: PrismaClient) => Promise<void>;

export interface Migration {
  up: MigrationFunction;
  down: MigrationFunction;
}

export interface MigrationFile {
  id: string;
  name: string;
  path: string;
  fileType: "ts" | "sql";
}

export interface MigrationHooks {
  beforeUp?: (migration: MigrationFile) => Promise<void>;
  afterUp?: (migration: MigrationFile) => Promise<void>;
  beforeDown?: (migration: MigrationFile) => Promise<void>;
  afterDown?: (migration: MigrationFile) => Promise<void>;
}

export interface MigrationsConfig {
  migrationsDir?: string;
  prismaClient?: PrismaClient;
  logLevel?: "silent" | "error" | "warn" | "info" | "debug" | "trace";
  hooks?: MigrationHooks;
  migrationFileType?: "sql" | "ts";
}
