import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import {
  MigrationFile,
  MigrationTemplate,
  MigrationConfig,
  FunctionMigrationTemplate,
} from "../utils/types";

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
    return {
      up: "",
      down: "",
    };
  }

  private formatSqlMigrationContent(template: MigrationTemplate): string {
    return `-- UP\n${template.up}\n\n-- DOWN\n${template.down}\n`;
  }

  private formatJsMigrationContent(
    _name: string,
    format: "js" | "ts",
    _template?: FunctionMigrationTemplate,
  ): string {
    return this.generatePrismaMigrationTemplate(format);
  }

  private generatePrismaMigrationTemplate(
    format: "js" | "ts",
  ): string {
    const isTypeScript = format === "ts";

    if (isTypeScript) {
      return `import { PrismaClient } from '@prisma/client';

export async function up(prisma: PrismaClient): Promise<void> {
}

export async function down(prisma: PrismaClient): Promise<void> {
}
`;
    } else {
      return `exports.up = async function(prisma) {
};

exports.down = async function(prisma) {
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
      unlinkSync(file.path);
      return true;
    }
    return false;
  }
}
