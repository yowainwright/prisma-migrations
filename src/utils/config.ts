import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { MigrationConfig } from "../utils/types";

export class ConfigManager {
  private config: MigrationConfig;
  private configPromise: Promise<MigrationConfig>;

  constructor(configPath?: string) {
    this.configPromise = this.loadConfig(configPath);

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

    const packageJsonPath = join(process.cwd(), "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        if (packageJson.prismaMigrations) {
          return { ...defaultConfig, ...packageJson.prismaMigrations };
        }
      } catch {}
    }

    const configFile = configPath || this.findConfigFile();
    if (configFile && existsSync(configFile)) {
      try {
        if (configFile.endsWith(".ts")) {
          console.warn(
            "TypeScript config files require tsx. Please use .mjs config files or ensure tsx is available.",
          );
        } else if (configFile.endsWith(".mjs") || configFile.endsWith(".js")) {
          const configModule = await import(pathToFileURL(configFile).href);
          const config = configModule.default || configModule;
          return { ...defaultConfig, ...config };
        } else {
          const configContent = readFileSync(configFile, "utf-8");
          const config = JSON.parse(configContent);
          return { ...defaultConfig, ...config };
        }
      } catch (error) {
        console.warn(`Failed to load config file ${configFile}:`, error);
      }
    }

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

  public getDatabaseUrl(required: boolean = true): string | null {
    if (this.config.databaseUrl) {
      return this.config.databaseUrl;
    }

    const envUrl = process.env.DATABASE_URL;
    if (envUrl) {
      return envUrl;
    }

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
      } catch {}
    }

    if (required) {
      throw new Error(
        "Database URL not found. Please set DATABASE_URL environment variable or configure it in your config file.",
      );
    }

    return null;
  }
}
