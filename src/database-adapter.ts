import { PrismaClient } from "@prisma/client";
import {
  Migration,
  MigrationStatus,
  MigrationFile,
  PrismaMigration,
} from "./types";
import { resolve } from "path";

export class DatabaseAdapter {
  private prisma: PrismaClient;
  private tableName: string;

  constructor(databaseUrl: string, tableName: string = "_prisma_migrations") {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    this.tableName = tableName;
  }

  public async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  public async ensureMigrationsTable(): Promise<void> {
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
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO ${this.tableName} (id, name)
      VALUES (?, ?)
    `,
      migrationId,
      name,
    );
  }

  public async removeMigration(migrationId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
      DELETE FROM ${this.tableName}
      WHERE id = ?
    `,
      migrationId,
    );
  }

  public async executeMigration(sql: string): Promise<void> {
    // Split SQL into individual statements
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

    // Load and execute the JavaScript/TypeScript migration
    const migration = await this.loadMigrationModule(migrationFile.path);

    if (direction === "up") {
      await migration.up(this.prisma);
    } else {
      await migration.down(this.prisma);
    }
  }

  private async loadMigrationModule(
    filePath: string,
  ): Promise<PrismaMigration> {
    try {
      // Clear module cache to ensure fresh loads during development
      const resolvedPath = resolve(filePath);
      delete require.cache[resolvedPath];

      // For TypeScript files, we need tsx to be available
      if (filePath.endsWith(".ts")) {
        // Check if tsx is available
        try {
          require.resolve("tsx");
        } catch {
          throw new Error(
            "tsx is required to run TypeScript migrations. Install it with: npm install tsx",
          );
        }

        // Import the TypeScript module directly
        // tsx should be configured to handle .ts files via require hooks or similar
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
        // JavaScript file
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
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async getLastMigration(): Promise<Migration | null> {
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

  public async getMigrationStatus(
    migrationId: string,
  ): Promise<MigrationStatus | null> {
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

  public async clearMigrations(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM ${this.tableName}`);
  }

  public async dropMigrationsTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DROP TABLE IF EXISTS ${this.tableName}`,
    );
  }

  public getDatabaseProvider(): string {
    // This is a simplified way to detect the provider
    // In a real implementation, you might want to parse the connection string
    // or use Prisma's internal methods
    return "postgresql"; // Default assumption
  }
}
