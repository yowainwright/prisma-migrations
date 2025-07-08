import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { MigrationFile, MigrationTemplate } from './types';

export class FileManager {
  private migrationsDir: string;

  constructor(migrationsDir: string) {
    this.migrationsDir = migrationsDir;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.migrationsDir)) {
      mkdirSync(this.migrationsDir, { recursive: true });
    }
  }

  public createMigrationFile(name: string, template?: MigrationTemplate): MigrationFile {
    const timestamp = this.generateTimestamp();
    const filename = `${timestamp}_${name}.sql`;
    const filePath = join(this.migrationsDir, filename);

    const defaultTemplate: MigrationTemplate = {
      up: `-- Migration: ${name}
-- Created at: ${new Date().toISOString()}

-- Add your migration SQL here
`,
      down: `-- Rollback for: ${name}
-- Created at: ${new Date().toISOString()}

-- Add your rollback SQL here
`
    };

    const content = this.formatMigrationContent(template || defaultTemplate);
    
    writeFileSync(filePath, content, 'utf-8');

    return {
      path: filePath,
      content,
      timestamp,
      name
    };
  }

  public readMigrationFiles(): MigrationFile[] {
    const files = readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(file => {
      const filePath = join(this.migrationsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      
      if (!match) {
        throw new Error(`Invalid migration file format: ${file}`);
      }

      const [, timestamp, name] = match;
      
      return {
        path: filePath,
        content,
        timestamp,
        name
      };
    });
  }

  public getMigrationFile(timestamp: string): MigrationFile | null {
    const files = this.readMigrationFiles();
    return files.find(file => file.timestamp === timestamp) || null;
  }

  public parseMigrationContent(content: string): { up: string; down: string } {
    const upMatch = content.match(/-- UP\s*\n([\s\S]*?)(?=-- DOWN|$)/);
    const downMatch = content.match(/-- DOWN\s*\n([\s\S]*?)$/);

    return {
      up: upMatch ? upMatch[1].trim() : content.trim(),
      down: downMatch ? downMatch[1].trim() : ''
    };
  }

  private formatMigrationContent(template: MigrationTemplate): string {
    return `-- UP
${template.up}

-- DOWN
${template.down}
`;
  }

  private generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  public getLatestMigration(): MigrationFile | null {
    const files = this.readMigrationFiles();
    return files.length > 0 ? files[files.length - 1] : null;
  }

  public getMigrationByName(name: string): MigrationFile | null {
    const files = this.readMigrationFiles();
    return files.find(file => file.name === name) || null;
  }

  public deleteMigrationFile(timestamp: string): boolean {
    const file = this.getMigrationFile(timestamp);
    if (file && existsSync(file.path)) {
      require('fs').unlinkSync(file.path);
      return true;
    }
    return false;
  }
}
