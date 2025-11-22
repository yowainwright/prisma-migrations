import type { PrismaClient } from "../types";

interface PrismaPackageJson {
  version: string;
}

async function getPrismaVersion(): Promise<number> {
  try {
    const pkg = (await import("@prisma/client/package.json", {
      assert: { type: "json" },
    })) as { default: PrismaPackageJson };
    const majorVersion = parseInt(pkg.default.version.split(".")[0]);
    return majorVersion;
  } catch {
    return 6;
  }
}

async function createAdapterForUrl(databaseUrl: string): Promise<any> {
  const url = new URL(databaseUrl);
  const protocol = url.protocol.replace(":", "");

  switch (protocol) {
    case "postgresql":
    case "postgres": {
      try {
        const adapterPkg = await import("@prisma/adapter-pg" as string);
        const pgPkg = await import("pg" as string);
        const pool = new pgPkg.Pool({ connectionString: databaseUrl });
        return new adapterPkg.PrismaPg(pool);
      } catch {
        throw new Error(
          "Prisma 7 with PostgreSQL requires adapter packages.\n" +
            "Install them with:\n" +
            "  npm install @prisma/adapter-pg pg\n" +
            "  # or\n" +
            "  bun add @prisma/adapter-pg pg",
        );
      }
    }

    case "mysql": {
      try {
        const adapterPkg = await import("@prisma/adapter-mysql2" as string);
        const mysqlPkg = await import("mysql2/promise" as string);
        const pool = mysqlPkg.createPool(databaseUrl);
        return new adapterPkg.PrismaMysql(pool);
      } catch {
        throw new Error(
          "Prisma 7 with MySQL requires adapter packages.\n" +
            "Install them with:\n" +
            "  npm install @prisma/adapter-mysql2 mysql2\n" +
            "  # or\n" +
            "  bun add @prisma/adapter-mysql2 mysql2",
        );
      }
    }

    case "file":
    case "sqlite": {
      try {
        const adapterPkg = await import("@prisma/adapter-sqlite" as string);
        const sqlitePkg = await import("better-sqlite3" as string);
        const db = new sqlitePkg.default(url.pathname);
        return new adapterPkg.PrismaSQLite(db);
      } catch {
        throw new Error(
          "Prisma 7 with SQLite requires adapter packages.\n" +
            "Install them with:\n" +
            "  npm install @prisma/adapter-sqlite better-sqlite3\n" +
            "  # or\n" +
            "  bun add @prisma/adapter-sqlite better-sqlite3",
        );
      }
    }

    default:
      throw new Error(
        `Unsupported database protocol: ${protocol}.\n` +
          `Supported protocols: postgresql, postgres, mysql, sqlite, file`,
      );
  }
}

export async function createPrismaClient(): Promise<PrismaClient> {
  const { PrismaClient } = await import("@prisma/client");
  const version = await getPrismaVersion();

  if (version >= 7) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is required for Prisma 7.\n" +
          "Please set it in your .env file or environment.",
      );
    }

    const adapter = await createAdapterForUrl(databaseUrl);
    return new PrismaClient({ adapter }) as unknown as PrismaClient;
  }

  return new PrismaClient() as unknown as PrismaClient;
}
