export interface PrismaMigrationClient {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

export interface PrismaClient extends PrismaMigrationClient {
  $transaction<T>(
    fn: (tx: PrismaMigrationClient) => Promise<T>,
    options?: unknown,
  ): Promise<T>;
  $disconnect(): Promise<void>;
}

export type MigrationFunction = (
  prisma: PrismaMigrationClient,
) => Promise<void>;

export interface Migration {
  up: MigrationFunction;
  down: MigrationFunction;
}

export interface MigrationFile {
  id: string;
  name: string;
  path: string;
  downPath?: string;
  format?: "prisma" | "legacy";
}

export interface MigrationStatus {
  migration: MigrationFile;
  applied: boolean;
}
