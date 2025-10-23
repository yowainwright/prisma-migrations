export interface PrismaClient {
  $executeRaw(query: TemplateStringsArray, ...values: any[]): Promise<number>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: any[]): Promise<T>;
  $raw(value: string): any;
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
}

export interface MigrationsConfig {
  migrationsDir?: string;
  prismaClient?: PrismaClient;
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}
