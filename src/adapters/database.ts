import {
  Migration,
  MigrationStatus,
  MigrationFile,
  PrismaMigration,
  Logger,
} from "../utils/types";
import { resolve, join } from "path";
import { existsSync } from "fs";
import { createLogger } from "../utils/logger";
import type { PrismaClientLike } from "../api/migration";

export class DatabaseAdapter {
  private prisma: PrismaClientLike;
  private tableName: string;
  private isPrismaTable: boolean | null = null;
  private PrismaClientConstructor?: new () => PrismaClientLike;
  private logger: Logger;

  constructor(
    _databaseUrl: string,
    tableName: string = "_prisma_migrations",
    customPrismaClient?: PrismaClientLike,
    customLogger?: Logger,
  ) {
    this.logger = createLogger("DatabaseAdapter", customLogger);
    
    if (customPrismaClient) {
      this.logger.debug("Using provided PrismaClient instance");
      this.prisma = customPrismaClient;
    } else {
      this.PrismaClientConstructor = this.resolvePrismaClient();

      if (!this.PrismaClientConstructor) {
        throw new Error(
          "Failed to load @prisma/client. Please ensure:\n" +
            "1. @prisma/client is installed: npm install @prisma/client\n" +
            "2. Prisma client is generated: npx prisma generate\n" +
            "3. Your schema.prisma file is properly configured\n" +
            "4. Or provide a PrismaClient instance in the configuration",
        );
      }

      this.prisma = new this.PrismaClientConstructor() as PrismaClientLike;
    }
    this.tableName = tableName;
  }

  private resolvePrismaClient(): any {
    const searchPaths = [
      process.cwd(),
      join(process.cwd(), ".."),
      join(process.cwd(), "../.."),
      join(process.cwd(), "../../.."),
      join(process.cwd(), "../../../.."),
      join(process.cwd(), "../../../../.."),
      join(process.cwd(), "node_modules"),
      join(process.cwd(), "..", "node_modules"),
      join(process.cwd(), "../..", "node_modules"),
    ];

    for (const searchPath of searchPaths) {
      try {
        const clientPath = require.resolve("@prisma/client", {
          paths: [searchPath],
        });
        const prismaModule = require(clientPath);

        if (prismaModule.PrismaClient) {
          this.logger.debug({ clientPath }, "Found PrismaClient");
          return prismaModule.PrismaClient;
        }
      } catch (err) {}

      const generatedPaths = [
        join(searchPath, "node_modules/.prisma/client"),
        join(searchPath, "node_modules/@prisma/client"),
        join(searchPath, "prisma/generated/client"),
      ];

      for (const genPath of generatedPaths) {
        try {
          if (
            existsSync(join(genPath, "index.js")) ||
            existsSync(join(genPath, "index.d.ts"))
          ) {
            const prismaModule = require(genPath);
            if (prismaModule.PrismaClient) {
              this.logger.debug({ path: genPath }, "Found generated PrismaClient");
              return prismaModule.PrismaClient;
            }
          }
        } catch (err) {}
      }
    }

    try {
      const prismaModule = require("@prisma/client");
      if (prismaModule.PrismaClient) {
        this.logger.debug("Found PrismaClient via direct require");
        return prismaModule.PrismaClient;
      }
    } catch (err) {
      this.logger.error({ error: err }, "Failed to load @prisma/client");
    }

    return null;
  }

  public async connect(): Promise<void> {
    try {
      if (this.prisma.$connect) {
        await this.prisma.$connect();
      }
      this.logger.info("Successfully connected to database");
    } catch (error) {
      this.logger.error({ error }, "Failed to connect to database");
      throw new Error(
        `Database connection failed. Please check:\n` +
          `1. Database is running and accessible\n` +
          `2. DATABASE_URL environment variable is set correctly\n` +
          `3. Database credentials are valid\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async disconnect(): Promise<void> {
    if (this.prisma.$disconnect) {
      await this.prisma.$disconnect();
    }
  }

  private async detectPrismaTable(): Promise<boolean> {
    if (this.isPrismaTable !== null) {
      return this.isPrismaTable;
    }

    try {
      const columnExists = (await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_name = '${this.tableName}' AND column_name = 'migration_name'
      `)) as any[];

      this.isPrismaTable = columnExists[0].count > 0;
      return this.isPrismaTable;
    } catch {
      this.isPrismaTable = false;
      return false;
    }
  }

  public async ensureMigrationsTable(): Promise<void> {
    const isPrismaTable = await this.detectPrismaTable();

    if (isPrismaTable) {
      return;
    }

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(255)
      )
    `;

    await this.prisma.$executeRawUnsafe(createTableQuery);
  }

  public async getAppliedMigrations(): Promise<Migration[]> {
    const isPrismaTable = await this.detectPrismaTable();

    if (isPrismaTable) {
      const results = (await this.prisma.$queryRawUnsafe(`
        SELECT id, migration_name, started_at as appliedAt
        FROM ${this.tableName}
        ORDER BY started_at ASC
      `)) as any[];

      return results.map((row) => ({
        id: row.id,
        name: row.migration_name,
        filename: `${row.id}_${row.migration_name}.sql`,
        timestamp: new Date(row.id.substring(0, 8)),
        applied: true,
        appliedAt: row.appliedAt,
      }));
    } else {
      const results = (await this.prisma.$queryRawUnsafe(`
        SELECT id, name, applied_at as appliedAt
        FROM ${this.tableName}
        ORDER BY applied_at ASC
      `)) as any[];

      return results.map((row) => ({
        id: row.id,
        name: row.name,
        filename: `${row.id}_${row.name}.sql`,
        timestamp: new Date(row.id.substring(0, 8)),
        applied: true,
        appliedAt: row.appliedAt,
      }));
    }
  }

  public async isMigrationApplied(migrationId: string): Promise<boolean> {
    const result = (await this.prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE id = ?
    `,
      migrationId,
    )) as any[];

    return result[0].count > 0;
  }

  public async recordMigration(
    migrationId: string,
    name: string,
  ): Promise<void> {
    const isPrismaTable = await this.detectPrismaTable();

    if (isPrismaTable) {
      return;
    } else {
      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO ${this.tableName} (id, name)
        VALUES (?, ?)
      `,
        migrationId,
        name,
      );
    }
  }

  public async removeMigration(migrationId: string): Promise<void> {
    const isPrismaTable = await this.detectPrismaTable();

    if (isPrismaTable) {
      return;
    } else {
      await this.prisma.$executeRawUnsafe(
        `
        DELETE FROM ${this.tableName}
        WHERE id = ?
      `,
        migrationId,
      );
    }
  }

  public async executeMigration(sql: string): Promise<void> {
    const statements = sql
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }
  }

  public async executeMigrationFile(
    migrationFile: MigrationFile,
    direction: "up" | "down",
  ): Promise<void> {
    if (migrationFile.type === "sql") {
      throw new Error("Use executeMigration() for SQL files");
    }

    const migration = await this.loadMigrationModule(migrationFile.path);
    const { createMigrationContext } = await import("../api/migration");
    const context = createMigrationContext(this.prisma);

    if (direction === "up") {
      await migration.up(context);
    } else {
      await migration.down(context);
    }
  }

  private async loadMigrationModule(
    filePath: string,
  ): Promise<PrismaMigration> {
    try {
      const resolvedPath = resolve(filePath);
      delete require.cache[resolvedPath];

      if (filePath.endsWith(".ts")) {
        try {
          require.resolve("tsx");
        } catch {
          throw new Error(
            "tsx is required to run TypeScript migrations. Install it with: npm install tsx",
          );
        }

        const module = await import(resolvedPath);

        if (!module.up || !module.down) {
          throw new Error(
            `TypeScript migration ${filePath} must export both 'up' and 'down' functions`,
          );
        }

        return {
          up: module.up,
          down: module.down,
        };
      } else {
        const module = await import(resolvedPath);
        const up = module.up || module.default?.up || module.exports?.up;
        const down =
          module.down || module.default?.down || module.exports?.down;

        if (!up || !down) {
          throw new Error(
            `JavaScript migration ${filePath} must export both 'up' and 'down' functions`,
          );
        }

        return { up, down };
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("tsx is required") ||
          error.message.includes("must export"))
      ) {
        throw error;
      }

      const fileType = filePath.endsWith(".ts") ? "TypeScript" : "JavaScript";
      const suggestion = filePath.endsWith(".ts")
        ? "Make sure tsx is installed and the file exports 'up' and 'down' functions."
        : "Make sure the file exports 'up' and 'down' functions.";

      throw new Error(
        `Failed to load ${fileType} migration ${filePath}. ${suggestion} Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async executeInTransaction(
    callback: () => Promise<void>,
  ): Promise<void> {
    await this.prisma.$transaction(async (_tx: any) => {
      await callback();
    });
  }

  public async testConnection(): Promise<boolean> {
    try {
      if (this.prisma.$queryRaw) {
        await this.prisma.$queryRaw`SELECT 1`;
      } else {
        await this.prisma.$queryRawUnsafe("SELECT 1");
      }
      return true;
    } catch {
      return false;
    }
  }

  public async getLastMigration(): Promise<Migration | null> {
    const isPrismaTable = await this.detectPrismaTable();

    if (isPrismaTable) {
      const result = (await this.prisma.$queryRawUnsafe(`
        SELECT id, migration_name, started_at as appliedAt
        FROM ${this.tableName}
        ORDER BY started_at DESC
        LIMIT 1
      `)) as any[];

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        id: row.id,
        name: row.migration_name,
        filename: `${row.id}_${row.migration_name}.sql`,
        timestamp: new Date(row.id.substring(0, 8)),
        applied: true,
        appliedAt: row.appliedAt,
      };
    } else {
      const result = (await this.prisma.$queryRawUnsafe(`
        SELECT id, name, applied_at as appliedAt
        FROM ${this.tableName}
        ORDER BY applied_at DESC
        LIMIT 1
      `)) as any[];

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        id: row.id,
        name: row.name,
        filename: `${row.id}_${row.name}.sql`,
        timestamp: new Date(row.id.substring(0, 8)),
        applied: true,
        appliedAt: row.appliedAt,
      };
    }
  }

  public async getMigrationStatus(
    migrationId: string,
  ): Promise<MigrationStatus | null> {
    const isPrismaTable = await this.detectPrismaTable();

    if (isPrismaTable) {
      const result = (await this.prisma.$queryRawUnsafe(
        `
        SELECT id, migration_name, started_at as appliedAt
        FROM ${this.tableName}
        WHERE id = ?
      `,
        migrationId,
      )) as any[];

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        id: row.id,
        name: row.migration_name,
        status: "applied",
        appliedAt: row.appliedAt,
      };
    } else {
      const result = (await this.prisma.$queryRawUnsafe(
        `
        SELECT id, name, applied_at as appliedAt
        FROM ${this.tableName}
        WHERE id = ?
      `,
        migrationId,
      )) as any[];

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        id: row.id,
        name: row.name,
        status: "applied",
        appliedAt: row.appliedAt,
      };
    }
  }

  public async clearMigrations(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM ${this.tableName}`);
  }

  public async dropMigrationsTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DROP TABLE IF EXISTS ${this.tableName}`,
    );
  }

  public getDatabaseProvider(): string {
    return "postgresql";
  }
}
