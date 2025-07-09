import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "fs";
import { join } from "path";
import {
  MigrationFile,
  MigrationTemplate,
  MigrationConfig,
  FunctionMigrationTemplate,
} from "./types";

export class FileManager {
  private migrationsDir: string;
  private config: MigrationConfig;

  constructor(migrationsDir: string, config: MigrationConfig) {
    this.migrationsDir = migrationsDir;
    this.config = config;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.migrationsDir)) {
      mkdirSync(this.migrationsDir, { recursive: true });
    }
  }

  public createMigrationFile(
    name: string,
    template?: MigrationTemplate | FunctionMigrationTemplate,
  ): MigrationFile {
    const timestamp = this.generateTimestamp();
    const format = this.config.migrationFormat || "ts";
    const extension = this.config.extension || `.${format}`;
    const filename = `${timestamp}_${name}${extension}`;
    const filePath = join(this.migrationsDir, filename);

    let content: string;

    if (format === "sql") {
      const defaultTemplate: MigrationTemplate = {
        up: `-- Migration: ${name}\n-- Created at: ${new Date().toISOString()}\n\n-- Add your migration SQL here\n`,
        down: `-- Rollback for: ${name}\n-- Created at: ${new Date().toISOString()}\n\n-- Add your rollback SQL here\n`,
      };
      content = this.formatSqlMigrationContent(
        (template as MigrationTemplate) || defaultTemplate,
      );
    } else {
      content = this.formatJsMigrationContent(
        name,
        format as "js" | "ts",
        template as FunctionMigrationTemplate,
      );
    }

    writeFileSync(filePath, content, "utf-8");

    return {
      path: filePath,
      content,
      timestamp,
      name,
      type: format,
    };
  }

  public readMigrationFiles(): MigrationFile[] {
    const files = readdirSync(this.migrationsDir)
      .filter(
        (file) =>
          file.endsWith(".sql") || file.endsWith(".js") || file.endsWith(".ts"),
      )
      .sort();

    return files.map((file) => {
      const filePath = join(this.migrationsDir, file);
      const content = readFileSync(filePath, "utf-8");
      const match = file.match(/^(\d+)_(.+)\.(sql|js|ts)$/);

      if (!match) {
        throw new Error(`Invalid migration file format: ${file}`);
      }

      const [, timestamp, name, type] = match;

      return {
        path: filePath,
        content,
        timestamp,
        name,
        type: type as "sql" | "js" | "ts",
      };
    });
  }

  public getMigrationFile(timestamp: string): MigrationFile | null {
    const files = this.readMigrationFiles();
    return files.find((file) => file.timestamp === timestamp) || null;
  }

  public parseMigrationContent(migrationFile: MigrationFile): {
    up: string;
    down: string;
  } {
    if (migrationFile.type === "sql") {
      return this.parseSqlMigrationContent(migrationFile.content);
    } else {
      // For JS/TS files, we'll need to execute them to get the SQL
      return this.parseJsMigrationContent(migrationFile);
    }
  }

  private parseSqlMigrationContent(content: string): {
    up: string;
    down: string;
  } {
    const upMatch = content.match(/-- UP\s*\n([\s\S]*?)(?=-- DOWN|$)/);
    const downMatch = content.match(/-- DOWN\s*\n([\s\S]*?)$/);

    return {
      up: upMatch ? upMatch[1].trim() : content.trim(),
      down: downMatch ? downMatch[1].trim() : "",
    };
  }

  private parseJsMigrationContent(_migrationFile: MigrationFile): {
    up: string;
    down: string;
  } {
    // For JS/TS migrations, we need to load the module and execute the functions
    // This will be handled by the DatabaseAdapter when it needs to execute migrations
    return {
      up: "",
      down: "",
    };
  }

  private formatSqlMigrationContent(template: MigrationTemplate): string {
    return `-- UP\n${template.up}\n\n-- DOWN\n${template.down}\n`;
  }

  private formatJsMigrationContent(
    name: string,
    format: "js" | "ts",
    _template?: FunctionMigrationTemplate,
  ): string {
    // Always use the default template for now
    return this.generatePrismaMigrationTemplate(name, format);
  }

  private generatePrismaMigrationTemplate(
    name: string,
    format: "js" | "ts",
  ): string {
    const isTypeScript = format === "ts";

    if (isTypeScript) {
      return `import { PrismaClient } from '@prisma/client';

/**
 * Migration: ${name}
 * Created at: ${new Date().toISOString()}
 */

export async function up(prisma: PrismaClient): Promise<void> {
  // Add your migration logic here
  // Example - Raw SQL:
  // await prisma.$executeRaw\`
  //   CREATE TABLE users (
  //     id SERIAL PRIMARY KEY,
  //     email VARCHAR(255) UNIQUE NOT NULL,
  //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  //     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //   )
  // \`;
  
  // Example - Using Prisma operations:
  // await prisma.user.createMany({
  //   data: [
  //     { email: 'admin@example.com' },
  //     { email: 'user@example.com' }
  //   ]
  // });
}

export async function down(prisma: PrismaClient): Promise<void> {
  // Add your rollback logic here
  // Example:
  // await prisma.$executeRaw\`DROP TABLE IF EXISTS users\`;
}
`;
    } else {
      return `// @ts-check

/**
 * Migration: ${name}
 * Created at: ${new Date().toISOString()}
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
exports.up = async function(prisma) {
  // Add your migration logic here
  // Example - Raw SQL:
  // await prisma.$executeRaw\`
  //   CREATE TABLE users (
  //     id SERIAL PRIMARY KEY,
  //     email VARCHAR(255) UNIQUE NOT NULL,
  //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  //     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //   )
  // \`;
  
  // Example - Using Prisma operations:
  // await prisma.user.createMany({
  //   data: [
  //     { email: 'admin@example.com' },
  //     { email: 'user@example.com' }
  //   ]
  // });
};

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
exports.down = async function(prisma) {
  // Add your rollback logic here
  // Example:
  // await prisma.$executeRaw\`DROP TABLE IF EXISTS users\`;
};
`;
    }
  }

  private generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  public getLatestMigration(): MigrationFile | null {
    const files = this.readMigrationFiles();
    return files.length > 0 ? files[files.length - 1] : null;
  }

  public getMigrationByName(name: string): MigrationFile | null {
    const files = this.readMigrationFiles();
    return files.find((file) => file.name === name) || null;
  }

  public deleteMigrationFile(timestamp: string): boolean {
    const file = this.getMigrationFile(timestamp);
    if (file && existsSync(file.path)) {
      require("fs").unlinkSync(file.path);
      return true;
    }
    return false;
  }
}
