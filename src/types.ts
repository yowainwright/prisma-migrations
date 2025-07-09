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
  migrationFormat?: 'sql' | 'js' | 'ts';
  extension?: string;
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
}

export interface RollbackMigrationOptions {
  to?: string;
  steps?: number;
  dryRun?: boolean;
  force?: boolean;
}

export interface MigrationTemplate {
  up: string;
  down: string;
}

export interface DatabaseConnection {
  url: string;
  provider: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver' | 'mongodb';
}

export interface MigrationFile {
  path: string;
  content: string;
  timestamp: string;
  name: string;
  type: 'sql' | 'js' | 'ts';
}

// Prisma-style migration function interface
export interface PrismaMigration {
  up(prisma: any): Promise<void>;
  down(prisma: any): Promise<void>;
}

// Function-based migration template
export interface FunctionMigrationTemplate {
  up: (prisma: any) => Promise<void>;
  down: (prisma: any) => Promise<void>;
}

// Migration context for function-based migrations
export interface MigrationContext {
  prisma: any;
  sql: (query: string, ...params: any[]) => Promise<any>;
}

export interface MigrationStatus {
  id: string;
  name: string;
  status: 'pending' | 'applied' | 'error';
  appliedAt?: Date;
  error?: string;
}
