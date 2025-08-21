export interface Migration {
  id: string;
  name: string;
  filename: string;
  timestamp: Date;
  applied: boolean;
  appliedAt?: Date;
  rollback?: string;
}

export interface MigrationConfig {
  migrationsDir: string;
  schemaPath: string;
  databaseUrl?: string;
  tableName?: string;
  createTable?: boolean;
  migrationFormat?: "sql" | "js" | "ts";
  extension?: string;
  prismaClient?: unknown; // Allow passing a custom PrismaClient instance
}

export interface MigrationState {
  current: string[];
  pending: string[];
  applied: Migration[];
}

export interface MigrationResult {
  success: boolean;
  migrations: Migration[];
  error?: string;
}

export interface CreateMigrationOptions {
  name: string;
  directory?: string;
  template?: string;
}

export interface RunMigrationOptions {
  to?: string;
  steps?: number;
  dryRun?: boolean;
  force?: boolean;
  explain?: boolean;
}

export interface RollbackMigrationOptions {
  to?: string;
  steps?: number;
  dryRun?: boolean;
  force?: boolean;
  explain?: boolean;
}

export interface MigrationTemplate {
  up: string;
  down: string;
}

export interface DatabaseConnection {
  url: string;
  provider: "postgresql" | "mysql" | "sqlite" | "sqlserver" | "mongodb";
}

export interface MigrationFile {
  path: string;
  content: string;
  timestamp: string;
  name: string;
  type: "sql" | "js" | "ts";
}

import type { MigrationContext as ApiMigrationContext } from "../api/migration";

export interface PrismaMigration {
  up(context: ApiMigrationContext): Promise<void>;
  down(context: ApiMigrationContext): Promise<void>;
}

export interface FunctionMigrationTemplate {
  up: (context: ApiMigrationContext) => Promise<void>;
  down: (context: ApiMigrationContext) => Promise<void>;
}

export type MigrationContext = ApiMigrationContext;

export interface MigrationStatus {
  id: string;
  name: string;
  status: "pending" | "applied" | "error";
  appliedAt?: Date;
  error?: string;
}

export interface VersionMigrationMapping {
  version: string;
  commit?: string; // Optional commit hash
  migrations: string[]; // Array of migration IDs/timestamps
  description?: string;
  createdAt: Date;
}

export interface VersionMigrationOptions {
  fromVersion?: string;
  toVersion: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface VersionMigrationResult {
  success: boolean;
  fromVersion?: string;
  toVersion: string;
  migrationsRun: Migration[];
  migrationsRolledBack: Migration[];
  error?: string;
}

export interface MigrationManifest {
  versions: VersionMigrationMapping[];
  currentVersion?: string;
  lastUpdated: Date;
}

export interface ColumnDetails {
  name: string;
  dataType?: string;
  nullable?: boolean;
  defaultValue?: string;
  constraints?: string[];
  previousType?: string;
  newType?: string;
  action?: "ADD" | "DROP" | "MODIFY" | "RENAME";
}

export interface MigrationChange {
  type: "CREATE" | "ALTER" | "DROP" | "INSERT" | "UPDATE" | "DELETE" | "OTHER";
  object: "TABLE" | "COLUMN" | "INDEX" | "CONSTRAINT" | "DATA" | "OTHER";
  target?: string;
  details?: string;
  sql: string;
  columnChanges?: ColumnDetails[];
}
