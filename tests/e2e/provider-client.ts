import type { PrismaClient as MigrationClient } from "prisma-migrations";

type Provider = "postgresql" | "mysql" | "sqlite";

export type ProviderClient = MigrationClient & {
  $queryRawUnsafe<T>(query: string): Promise<T>;
};

function getEnvironment(name: string): string {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required`);
}

function getProvider(): Provider {
  const provider = getEnvironment("PRISMA_PROVIDER");
  if (provider === "postgresql") return provider;
  if (provider === "mysql") return provider;
  if (provider === "sqlite") return provider;
  throw new Error(`Unsupported provider: ${provider}`);
}

async function createPostgresAdapter(databaseUrl: string) {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const config = { connectionString: databaseUrl };
  const adapter = new PrismaPg(config);
  return adapter;
}

async function createMysqlAdapter(databaseUrl: string) {
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const connection = new URL(databaseUrl);
  const database = connection.pathname.slice(1);
  const port = Number(connection.port || 3306);
  const user = decodeURIComponent(connection.username);
  const password = decodeURIComponent(connection.password);
  const config = {
    host: connection.hostname,
    port,
    user,
    password,
    database,
    connectionLimit: 5,
  };
  const adapter = new PrismaMariaDb(config);
  return adapter;
}

async function createSqliteAdapter(databaseUrl: string) {
  const { PrismaLibSql } = await import("@prisma/adapter-libsql");
  const config = { url: databaseUrl };
  const adapter = new PrismaLibSql(config);
  return adapter;
}

async function createAdapter(provider: Provider, databaseUrl: string) {
  if (provider === "postgresql") {
    const adapter = await createPostgresAdapter(databaseUrl);
    return adapter;
  }
  if (provider === "mysql") {
    const adapter = await createMysqlAdapter(databaseUrl);
    return adapter;
  }
  const adapter = await createSqliteAdapter(databaseUrl);
  return adapter;
}

async function createLatestClient(): Promise<ProviderClient> {
  const { PrismaClient } = await import("./generated/prisma/client");
  const provider = getProvider();
  const databaseUrl = getEnvironment("DATABASE_URL");
  const adapter = await createAdapter(provider, databaseUrl);
  const client = new PrismaClient({ adapter });
  return client as unknown as ProviderClient;
}

async function createLegacyClient(): Promise<ProviderClient> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  return client as unknown as ProviderClient;
}

export async function createProviderClient(): Promise<ProviderClient> {
  const version = getEnvironment("PRISMA_VERSION");
  const usesAdapters = version.startsWith("7.");
  if (usesAdapters) {
    const client = await createLatestClient();
    return client;
  }
  const client = await createLegacyClient();
  return client;
}
