import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MigrationConfig } from './types';

export class ConfigManager {
  private config: MigrationConfig;
  
  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath?: string): MigrationConfig {
    const defaultConfig: MigrationConfig = {
      migrationsDir: './migrations',
      schemaPath: './prisma/schema.prisma',
      tableName: '_prisma_migrations',
      createTable: true
    };

    // Try to load from package.json
    const packageJsonPath = join(process.cwd(), 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.prismaMigrations) {
          return { ...defaultConfig, ...packageJson.prismaMigrations };
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }

    // Try to load from config file
    const configFile = configPath || join(process.cwd(), 'prisma-migrations.config.js');
    if (existsSync(configFile)) {
      try {
        const config = require(configFile);
        return { ...defaultConfig, ...config };
      } catch (error) {
        // Ignore loading errors
      }
    }

    // Try to load from prisma directory
    const prismaDir = join(process.cwd(), 'prisma');
    if (existsSync(prismaDir)) {
      const schemaPath = join(prismaDir, 'schema.prisma');
      if (existsSync(schemaPath)) {
        defaultConfig.schemaPath = schemaPath;
      }
    }

    return defaultConfig;
  }

  public getConfig(): MigrationConfig {
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
        const schema = readFileSync(this.config.schemaPath, 'utf-8');
        const urlMatch = schema.match(/url\s*=\s*env\("([^"]+)"\)/);
        if (urlMatch) {
          const envVar = urlMatch[1];
          const envValue = process.env[envVar];
          if (envValue) {
            return envValue;
          }
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }

    throw new Error('Database URL not found. Please set DATABASE_URL environment variable or configure it in your config file.');
  }
}
