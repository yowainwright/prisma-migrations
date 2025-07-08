import { ConfigManager } from './config';
import { FileManager } from './file-manager';
import { DatabaseAdapter } from './database-adapter';
import {
  Migration,
  MigrationResult,
  MigrationState,
  MigrationStatus,
  CreateMigrationOptions,
  RunMigrationOptions,
  RollbackMigrationOptions,
  MigrationFile,
  MigrationTemplate
} from './types';

export class MigrationManager {
  private config: ConfigManager;
  private fileManager: FileManager;
  private dbAdapter: DatabaseAdapter;

  constructor(configPath?: string) {
    this.config = new ConfigManager(configPath);
    const { migrationsDir, tableName } = this.config.getConfig();
    this.fileManager = new FileManager(migrationsDir);
    
    const databaseUrl = this.config.getDatabaseUrl();
    this.dbAdapter = new DatabaseAdapter(databaseUrl, tableName);
  }

  public async initialize(): Promise<void> {
    await this.dbAdapter.connect();
    await this.dbAdapter.ensureMigrationsTable();
  }

  public async destroy(): Promise<void> {
    await this.dbAdapter.disconnect();
  }

  public async createMigration(options: CreateMigrationOptions): Promise<MigrationFile> {
    const { name, template } = options;
    
    // Validate migration name
    if (!name || name.trim().length === 0) {
      throw new Error('Migration name cannot be empty');
    }

    // Check if migration with same name exists
    const existingMigration = this.fileManager.getMigrationByName(name);
    if (existingMigration) {
      throw new Error(`Migration with name '${name}' already exists`);
    }

    return this.fileManager.createMigrationFile(name, template);
  }

  public async runMigrations(options: RunMigrationOptions = {}): Promise<MigrationResult> {
    const { to, steps, dryRun = false, force = false } = options;
    
    try {
      await this.initialize();

      const state = await this.getMigrationState();
      let migrationsToRun: MigrationFile[] = [];

      if (to) {
        // Run up to specific migration
        const targetMigration = this.fileManager.getMigrationFile(to) || 
                               this.fileManager.getMigrationByName(to);
        if (!targetMigration) {
          throw new Error(`Migration '${to}' not found`);
        }
        migrationsToRun = this.getMigrationsUpTo(targetMigration.timestamp);
      } else if (steps) {
        // Run specific number of migrations
        migrationsToRun = this.getMigrationsToRun(steps);
      } else {
        // Run all pending migrations
        migrationsToRun = this.getAllPendingMigrations();
      }

      if (dryRun) {
        return {
          success: true,
          migrations: migrationsToRun.map(file => ({
            id: file.timestamp,
            name: file.name,
            filename: file.path,
            timestamp: new Date(),
            applied: false
          }))
        };
      }

      const appliedMigrations: Migration[] = [];

      for (const migrationFile of migrationsToRun) {
        const isApplied = await this.dbAdapter.isMigrationApplied(migrationFile.timestamp);
        
        if (isApplied && !force) {
          continue;
        }

        const { up } = this.fileManager.parseMigrationContent(migrationFile.content);
        
        await this.dbAdapter.executeInTransaction(async () => {
          await this.dbAdapter.executeMigration(up);
          await this.dbAdapter.recordMigration(migrationFile.timestamp, migrationFile.name);
        });

        appliedMigrations.push({
          id: migrationFile.timestamp,
          name: migrationFile.name,
          filename: migrationFile.path,
          timestamp: new Date(),
          applied: true,
          appliedAt: new Date()
        });
      }

      return {
        success: true,
        migrations: appliedMigrations
      };
    } catch (error) {
      return {
        success: false,
        migrations: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await this.destroy();
    }
  }

  public async rollbackMigrations(options: RollbackMigrationOptions = {}): Promise<MigrationResult> {
    const { to, steps, dryRun = false, force = false } = options;
    
    try {
      await this.initialize();

      const appliedMigrations = await this.dbAdapter.getAppliedMigrations();
      let migrationsToRollback: Migration[] = [];

      if (to) {
        // Rollback to specific migration
        const targetMigration = this.fileManager.getMigrationFile(to) || 
                               this.fileManager.getMigrationByName(to);
        if (!targetMigration) {
          throw new Error(`Migration '${to}' not found`);
        }
        migrationsToRollback = this.getMigrationsToRollbackTo(appliedMigrations, targetMigration.timestamp);
      } else if (steps) {
        // Rollback specific number of migrations
        migrationsToRollback = appliedMigrations.slice(-steps).reverse();
      } else {
        // Rollback last migration
        const lastMigration = await this.dbAdapter.getLastMigration();
        if (lastMigration) {
          migrationsToRollback = [lastMigration];
        }
      }

      if (dryRun) {
        return {
          success: true,
          migrations: migrationsToRollback
        };
      }

      const rolledBackMigrations: Migration[] = [];

      for (const migration of migrationsToRollback) {
        const migrationFile = this.fileManager.getMigrationFile(migration.id);
        if (!migrationFile) {
          throw new Error(`Migration file not found for ${migration.id}`);
        }

        const { down } = this.fileManager.parseMigrationContent(migrationFile.content);
        
        if (!down || down.trim().length === 0) {
          if (!force) {
            throw new Error(`No rollback SQL found for migration ${migration.name}`);
          }
          continue;
        }

        await this.dbAdapter.executeInTransaction(async () => {
          await this.dbAdapter.executeMigration(down);
          await this.dbAdapter.removeMigration(migration.id);
        });

        rolledBackMigrations.push({
          ...migration,
          applied: false
        });
      }

      return {
        success: true,
        migrations: rolledBackMigrations
      };
    } catch (error) {
      return {
        success: false,
        migrations: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await this.destroy();
    }
  }

  public async getMigrationState(): Promise<MigrationState> {
    await this.initialize();
    
    const allMigrations = this.fileManager.readMigrationFiles();
    const appliedMigrations = await this.dbAdapter.getAppliedMigrations();
    
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    const pendingMigrations = allMigrations.filter(m => !appliedIds.has(m.timestamp));
    
    await this.destroy();
    
    return {
      current: appliedMigrations.map(m => m.id),
      pending: pendingMigrations.map(m => m.timestamp),
      applied: appliedMigrations
    };
  }

  public async getMigrationStatus(): Promise<MigrationStatus[]> {
    await this.initialize();
    
    const allMigrations = this.fileManager.readMigrationFiles();
    const appliedMigrations = await this.dbAdapter.getAppliedMigrations();
    
    const appliedMap = new Map(appliedMigrations.map(m => [m.id, m]));
    
    const statuses: MigrationStatus[] = allMigrations.map(file => {
      const applied = appliedMap.get(file.timestamp);
      return {
        id: file.timestamp,
        name: file.name,
        status: applied ? 'applied' : 'pending',
        appliedAt: applied?.appliedAt
      };
    });
    
    await this.destroy();
    return statuses;
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.initialize();
      const result = await this.dbAdapter.testConnection();
      await this.destroy();
      return result;
    } catch (error) {
      return false;
    }
  }

  private getMigrationsUpTo(targetTimestamp: string): MigrationFile[] {
    const allMigrations = this.fileManager.readMigrationFiles();
    return allMigrations.filter(m => m.timestamp <= targetTimestamp);
  }

  private getMigrationsToRun(steps: number): MigrationFile[] {
    const allMigrations = this.fileManager.readMigrationFiles();
    return allMigrations.slice(0, steps);
  }

  private getAllPendingMigrations(): MigrationFile[] {
    return this.fileManager.readMigrationFiles();
  }

  private getMigrationsToRollbackTo(appliedMigrations: Migration[], targetTimestamp: string): Migration[] {
    const targetIndex = appliedMigrations.findIndex(m => m.id === targetTimestamp);
    if (targetIndex === -1) {
      return [];
    }
    return appliedMigrations.slice(targetIndex + 1).reverse();
  }
}
