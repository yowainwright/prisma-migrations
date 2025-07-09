import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { MigrationConfig } from "./types";

export class ConfigManager {
  private config: MigrationConfig;
  private configPromise: Promise<MigrationConfig>;

  constructor(configPath?: string) {
    this.configPromise = this.loadConfig(configPath);
    // Initialize with default config synchronously for backwards compatibility
    this.config = this.getDefaultConfig();
  }

  private getDefaultConfig(): MigrationConfig {
    return {
      migrationsDir: "./migrations",
      schemaPath: "./prisma/schema.prisma",
      tableName: "_prisma_migrations",
      createTable: true,
      migrationFormat: "ts",
      extension: ".ts",
    };
  }

  private async loadConfig(configPath?: string): Promise<MigrationConfig> {
    const defaultConfig: MigrationConfig = {
      migrationsDir: "./migrations",
      schemaPath: "./prisma/schema.prisma",
      tableName: "_prisma_migrations",
      createTable: true,
      migrationFormat: "ts",
      extension: ".ts",
    };

    // Try to load from package.json
    const packageJsonPath = join(process.cwd(), "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        if (packageJson.prismaMigrations) {
          return { ...defaultConfig, ...packageJson.prismaMigrations };
        }
      } catch {
      }
    }

    // Try to load from config file
    const configFile = configPath || this.findConfigFile();
    if (configFile && existsSync(configFile)) {
      try {
        if (configFile.endsWith(".ts")) {
          // For TypeScript config files, we'd need tsx or compilation
          console.warn(
            "TypeScript config files require tsx. Please use .mjs config files or ensure tsx is available.",
          );
        } else if (configFile.endsWith(".mjs") || configFile.endsWith(".js")) {
          // Use dynamic import for ESM files
          const configModule = await import(pathToFileURL(configFile).href);
          const config = configModule.default || configModule;
          return { ...defaultConfig, ...config };
        } else {
          // JSON files
          const configContent = readFileSync(configFile, "utf-8");
          const config = JSON.parse(configContent);
          return { ...defaultConfig, ...config };
        }
      } catch (error) {
        console.warn(`Failed to load config file ${configFile}:`, error);
      }
    }

    // Try to load from prisma directory
    const prismaDir = join(process.cwd(), "prisma");
    if (existsSync(prismaDir)) {
      const schemaPath = join(prismaDir, "schema.prisma");
      if (existsSync(schemaPath)) {
        defaultConfig.schemaPath = schemaPath;
      }
    }

    return defaultConfig;
  }

  private findConfigFile(): string | null {
    const possibleFiles = [
      join(process.cwd(), "prisma-migrations.config.js"),
      join(process.cwd(), "prisma-migrations.config.ts"),
      join(process.cwd(), "prisma-migrations.config.mjs"),
      join(process.cwd(), "prisma-migrations.config.json"),
    ];

    for (const file of possibleFiles) {
      if (existsSync(file)) {
        return file;
      }
    }

    return null;
  }

  public getConfig(): MigrationConfig {
    return this.config;
  }

  public async getConfigAsync(): Promise<MigrationConfig> {
    this.config = await this.configPromise;
    return this.config;
  }

  public updateConfig(updates: Partial<MigrationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public getDatabaseUrl(): string {
    if (this.config.databaseUrl) {
      return this.config.databaseUrl;
    }

    // Try to get from environment
    const envUrl = process.env.DATABASE_URL;
    if (envUrl) {
      return envUrl;
    }

    // Try to parse from schema.prisma
    if (existsSync(this.config.schemaPath)) {
      try {
        const schema = readFileSync(this.config.schemaPath, "utf-8");
        const urlMatch = schema.match(/url\s*=\s*env\("([^"]+)"\)/);
        if (urlMatch) {
          const envVar = urlMatch[1];
          const envValue = process.env[envVar];
          if (envValue) {
            return envValue;
          }
        }
      } catch {
      }
    }

    throw new Error(
      "Database URL not found. Please set DATABASE_URL environment variable or configure it in your config file.",
    );
  }
}
