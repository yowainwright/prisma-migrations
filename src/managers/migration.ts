import { ConfigManager } from "../utils/config";
import { FileManager } from "./file";
import { DatabaseAdapter } from "../adapters/database";
import { VersionManager } from "./version";
import { DiffGenerator } from "../api/diff";
import { createLogger } from "../utils/logger";
import type { PrismaClientLike } from "../api/migration";
import pMap from "p-map";
import {
  Migration,
  MigrationResult,
  MigrationState,
  MigrationStatus,
  CreateMigrationOptions,
  RunMigrationOptions,
  RollbackMigrationOptions,
  MigrationFile,
  VersionMigrationOptions,
  VersionMigrationResult,
  VersionMigrationMapping,
  Logger,
} from "../utils/types";

export class MigrationManager {
  private config: ConfigManager;
  private fileManager: FileManager;
  private dbAdapter: DatabaseAdapter | null;
  private versionManager: VersionManager;
  private diffGenerator: DiffGenerator;
  private logger: Logger;

  constructor(configPath?: string) {
    this.config = new ConfigManager(configPath);
    const config = this.config.getConfig();
    const { migrationsDir, tableName, prismaClient, logger } = config;
    this.logger = createLogger("MigrationManager", logger);
    this.fileManager = new FileManager(migrationsDir, config);
    this.versionManager = new VersionManager(migrationsDir);
    this.diffGenerator = new DiffGenerator();

    const databaseUrl = this.config.getDatabaseUrl(false);
    if (databaseUrl) {
      this.dbAdapter = new DatabaseAdapter(
        databaseUrl,
        tableName,
        prismaClient as PrismaClientLike | undefined,
        logger,
      );
    } else {
      this.dbAdapter = null;
    }
  }

  private ensureDbAdapter(): DatabaseAdapter {
    if (!this.dbAdapter) {
      throw new Error(
        "Database adapter not initialized. Please set DATABASE_URL or configure a database connection.",
      );
    }
    return this.dbAdapter;
  }

  private async ensureConfigLoaded(): Promise<void> {
    const config = await this.config.getConfigAsync();
    const { migrationsDir, tableName, prismaClient, logger } = config;
    this.logger = createLogger("MigrationManager", logger);
    this.fileManager = new FileManager(migrationsDir, config);
    this.versionManager = new VersionManager(migrationsDir);

    const databaseUrl = this.config.getDatabaseUrl(false);
    if (databaseUrl) {
      this.dbAdapter = new DatabaseAdapter(
        databaseUrl,
        tableName,
        prismaClient as PrismaClientLike | undefined,
        logger,
      );
    }
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing migration manager...");
      const adapter = this.ensureDbAdapter();
      await adapter.connect();
      await adapter.ensureMigrationsTable();
      this.logger.info("Migration manager initialized successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize");
      throw error;
    }
  }

  public async destroy(): Promise<void> {
    if (this.dbAdapter) {
      await this.dbAdapter.disconnect();
    }
  }

  public async createMigration(
    options: CreateMigrationOptions,
  ): Promise<MigrationFile> {
    await this.ensureConfigLoaded();

    const { name, template } = options;

    if (!name || name.trim().length === 0) {
      throw new Error("Migration name cannot be empty");
    }

    const existingMigration = this.fileManager.getMigrationByName(name);
    if (existingMigration) {
      throw new Error(`Migration with name '${name}' already exists`);
    }

    return this.fileManager.createMigrationFile(name, template as any);
  }

  private resolveMigrationsToRun(
    to: string | undefined,
    steps: number | undefined,
  ): MigrationFile[] {
    if (to) {
      const targetMigration =
        this.fileManager.getMigrationFile(to) ||
        this.fileManager.getMigrationByName(to);
      if (!targetMigration) {
        throw new Error(`Migration '${to}' not found`);
      }
      return this.getMigrationsUpTo(targetMigration.timestamp);
    }

    if (steps) {
      return this.getMigrationsToRun(steps);
    }

    return this.getAllPendingMigrations();
  }

  private generateDiffForMigrations(
    migrations: MigrationFile[],
    direction: "up" | "down",
  ): string {
    return migrations
      .map((migration) => this.diffGenerator.formatDiff(migration, direction))
      .join("\n\n");
  }

  private async executeMigrationUp(
    adapter: DatabaseAdapter,
    migrationFile: MigrationFile,
    force: boolean,
  ): Promise<Migration | null> {
    const isApplied = await adapter.isMigrationApplied(migrationFile.timestamp);
    const shouldSkip = isApplied && !force;

    if (shouldSkip) {
      return null;
    }

    await adapter.executeInTransaction(async () => {
      const isSqlType = migrationFile.type === "sql";
      if (isSqlType) {
        const content = this.fileManager.parseMigrationContent(migrationFile);
        const up = content.up;
        await adapter.executeMigration(up);
      } else {
        await adapter.executeMigrationFile(migrationFile, "up");
      }
      await adapter.recordMigration(
        migrationFile.timestamp,
        migrationFile.name,
      );
    });

    return {
      id: migrationFile.timestamp,
      name: migrationFile.name,
      filename: migrationFile.path,
      timestamp: new Date(),
      applied: true,
      appliedAt: new Date(),
    };
  }

  public async runMigrations(
    options: RunMigrationOptions = {},
  ): Promise<MigrationResult & { diff?: string }> {
    const to = options.to;
    const steps = options.steps;
    const dryRun = options.dryRun ?? false;
    const force = options.force ?? false;
    const explain = options.explain ?? false;

    try {
      await this.initialize();
      const adapter = this.ensureDbAdapter();

      const migrationsToRun = this.resolveMigrationsToRun(to, steps);

      let diff: string | undefined;
      const shouldGenerateDiff = dryRun || explain;
      if (shouldGenerateDiff) {
        diff = this.generateDiffForMigrations(migrationsToRun, "up");
      }

      if (dryRun) {
        return {
          success: true,
          migrations: migrationsToRun.map((file) => ({
            id: file.timestamp,
            name: file.name,
            filename: file.path,
            timestamp: new Date(),
            applied: false,
          })),
          diff,
        };
      }

      const appliedMigrations = await pMap(
        migrationsToRun,
        async (migrationFile) => this.executeMigrationUp(adapter, migrationFile, force),
        { concurrency: 1 },
      );

      const filteredMigrations = appliedMigrations.filter(
        (m): m is Migration => m !== null,
      );

      return {
        success: true,
        migrations: filteredMigrations,
        diff,
      };
    } catch (error) {
      return {
        success: false,
        migrations: [],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.destroy();
    }
  }

  private async resolveMigrationsToRollback(
    adapter: DatabaseAdapter,
    to: string | undefined,
    steps: number | undefined,
  ): Promise<Migration[]> {
    const appliedMigrations = await adapter.getAppliedMigrations();

    if (to) {
      const targetMigration =
        this.fileManager.getMigrationFile(to) ||
        this.fileManager.getMigrationByName(to);
      if (!targetMigration) {
        throw new Error(`Migration '${to}' not found`);
      }
      return this.getMigrationsToRollbackTo(
        appliedMigrations,
        targetMigration.timestamp,
      );
    }

    if (steps) {
      return appliedMigrations.slice(-steps).reverse();
    }

    const lastMigration = await adapter.getLastMigration();
    return lastMigration ? [lastMigration] : [];
  }

  private generateDiffForRollback(migrations: Migration[]): string {
    const migrationFiles = migrations.map((m) => {
      const file = this.fileManager.getMigrationFile(m.id);
      if (!file) throw new Error(`Migration file not found for ${m.id}`);
      return file;
    });
    return this.generateDiffForMigrations(migrationFiles, "down");
  }

  private async executeSqlMigrationDown(
    adapter: DatabaseAdapter,
    migrationFile: MigrationFile,
    migrationName: string,
    force: boolean,
  ): Promise<void> {
    const content = this.fileManager.parseMigrationContent(migrationFile);
    const down = content.down;
    const hasNoDown = !down || down.trim().length === 0;

    if (hasNoDown) {
      const shouldThrow = !force;
      if (shouldThrow) {
        throw new Error(
          `No rollback SQL found for migration ${migrationName}`,
        );
      }
      return;
    }

    await adapter.executeMigration(down);
  }

  private async executeCodeMigrationDown(
    adapter: DatabaseAdapter,
    migrationFile: MigrationFile,
    migrationName: string,
    force: boolean,
  ): Promise<void> {
    try {
      await adapter.executeMigrationFile(migrationFile, "down");
    } catch (error) {
      const shouldThrow = !force;
      if (shouldThrow) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to rollback migration ${migrationName}: ${errorMessage}`,
        );
      }
    }
  }

  private async executeMigrationDown(
    adapter: DatabaseAdapter,
    migration: Migration,
    force: boolean,
  ): Promise<Migration> {
    const migrationFile = this.fileManager.getMigrationFile(migration.id);
    if (!migrationFile) {
      throw new Error(`Migration file not found for ${migration.id}`);
    }

    await adapter.executeInTransaction(async () => {
      const isSqlType = migrationFile.type === "sql";

      if (isSqlType) {
        await this.executeSqlMigrationDown(adapter, migrationFile, migration.name, force);
      } else {
        await this.executeCodeMigrationDown(adapter, migrationFile, migration.name, force);
      }

      await adapter.removeMigration(migration.id);
    });

    return {
      ...migration,
      applied: false,
    };
  }

  public async rollbackMigrations(
    options: RollbackMigrationOptions = {},
  ): Promise<MigrationResult & { diff?: string }> {
    const to = options.to;
    const steps = options.steps;
    const dryRun = options.dryRun ?? false;
    const force = options.force ?? false;
    const explain = options.explain ?? false;

    try {
      await this.initialize();
      const adapter = this.ensureDbAdapter();

      const migrationsToRollback = await this.resolveMigrationsToRollback(
        adapter,
        to,
        steps,
      );

      let diff: string | undefined;
      const shouldGenerateDiff = dryRun || explain;
      if (shouldGenerateDiff) {
        diff = this.generateDiffForRollback(migrationsToRollback);
      }

      if (dryRun) {
        return {
          success: true,
          migrations: migrationsToRollback,
          diff,
        };
      }

      const rolledBackMigrations = await pMap(
        migrationsToRollback,
        async (migration) => this.executeMigrationDown(adapter, migration, force),
        { concurrency: 1 },
      );

      return {
        success: true,
        migrations: rolledBackMigrations,
        diff,
      };
    } catch (error) {
      return {
        success: false,
        migrations: [],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.destroy();
    }
  }

  public async getMigrationState(): Promise<MigrationState> {
    await this.initialize();
    const adapter = this.ensureDbAdapter();

    const allMigrations = this.fileManager.readMigrationFiles();
    const appliedMigrations = await adapter.getAppliedMigrations();

    const appliedIds = new Set(appliedMigrations.map((m) => m.id));
    const pendingMigrations = allMigrations.filter(
      (m) => !appliedIds.has(m.timestamp),
    );

    await this.destroy();

    return {
      current: appliedMigrations.map((m) => m.id),
      pending: pendingMigrations.map((m) => m.timestamp),
      applied: appliedMigrations,
    };
  }

  public async getMigrationStatus(): Promise<MigrationStatus[]> {
    await this.initialize();
    const adapter = this.ensureDbAdapter();

    const allMigrations = this.fileManager.readMigrationFiles();
    const appliedMigrations = await adapter.getAppliedMigrations();

    const appliedMap = new Map(appliedMigrations.map((m) => [m.id, m]));

    const statuses: MigrationStatus[] = allMigrations.map((file) => {
      const applied = appliedMap.get(file.timestamp);
      return {
        id: file.timestamp,
        name: file.name,
        status: applied ? "applied" : "pending",
        appliedAt: applied?.appliedAt,
      };
    });

    await this.destroy();
    return statuses;
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.initialize();
      const adapter = this.ensureDbAdapter();
      const result = await adapter.testConnection();
      await this.destroy();
      return result;
    } catch {
      return false;
    }
  }

  private getMigrationsUpTo(targetTimestamp: string): MigrationFile[] {
    const allMigrations = this.fileManager.readMigrationFiles();
    return allMigrations.filter((m) => m.timestamp <= targetTimestamp);
  }

  private getMigrationsToRun(steps: number): MigrationFile[] {
    const allMigrations = this.fileManager.readMigrationFiles();
    return allMigrations.slice(0, steps);
  }

  private getAllPendingMigrations(): MigrationFile[] {
    return this.fileManager.readMigrationFiles();
  }

  private getMigrationsToRollbackTo(
    appliedMigrations: Migration[],
    targetTimestamp: string,
  ): Migration[] {
    const targetIndex = appliedMigrations.findIndex(
      (m) => m.id === targetTimestamp,
    );
    if (targetIndex === -1) {
      return [];
    }
    return appliedMigrations.slice(targetIndex + 1).reverse();
  }

  public registerVersion(
    version: string,
    migrations: string[],
    description?: string,
    commit?: string,
  ): void {
    this.versionManager.registerVersion(
      version,
      migrations,
      description,
      commit,
    );
  }

  public async deployToVersion(
    options: VersionMigrationOptions,
  ): Promise<VersionMigrationResult> {
    const { fromVersion, toVersion, dryRun = false, force = false } = options;

    try {
      await this.initialize();
      const adapter = this.ensureDbAdapter();

      const currentVersion =
        fromVersion || this.versionManager.getCurrentVersion();
      const { migrationsToRun, migrationsToRollback } =
        this.versionManager.getMigrationsBetween(currentVersion, toVersion);

      if (dryRun) {
        const plan = this.versionManager.generateDeploymentPlan(
          currentVersion,
          toVersion,
        );
        this.logger.info({ summary: plan.summary }, "Version deployment plan");

        return {
          success: true,
          fromVersion: currentVersion,
          toVersion,
          migrationsRun: [],
          migrationsRolledBack: [],
        };
      }

      const migrationsRun: Migration[] = [];
      const migrationsRolledBack: Migration[] = [];

      for (const migrationId of migrationsToRollback.reverse()) {
        const migrationFile = this.fileManager.getMigrationFile(migrationId);
        if (!migrationFile) {
          throw new Error(`Migration file not found for ${migrationId}`);
        }

        await adapter.executeInTransaction(async () => {
          if (migrationFile.type === "sql") {
            const { down } =
              this.fileManager.parseMigrationContent(migrationFile);
            if (!down || down.trim().length === 0) {
              if (!force) {
                throw new Error(
                  `No rollback SQL found for migration ${migrationFile.name}`,
                );
              }
              return;
            }
            await adapter.executeMigration(down);
          } else {
            await adapter.executeMigrationFile(migrationFile, "down");
          }
          await adapter.removeMigration(migrationId);
        });

        migrationsRolledBack.push({
          id: migrationId,
          name: migrationFile.name,
          filename: migrationFile.path,
          timestamp: new Date(),
          applied: false,
        });
      }

      for (const migrationId of migrationsToRun) {
        const migrationFile = this.fileManager.getMigrationFile(migrationId);
        if (!migrationFile) {
          throw new Error(`Migration file not found for ${migrationId}`);
        }

        const isApplied = await adapter.isMigrationApplied(migrationId);
        if (isApplied && !force) {
          continue;
        }

        await adapter.executeInTransaction(async () => {
          if (migrationFile.type === "sql") {
            const { up } =
              this.fileManager.parseMigrationContent(migrationFile);
            await adapter.executeMigration(up);
          } else {
            await adapter.executeMigrationFile(migrationFile, "up");
          }
          await adapter.recordMigration(migrationId, migrationFile.name);
        });

        migrationsRun.push({
          id: migrationId,
          name: migrationFile.name,
          filename: migrationFile.path,
          timestamp: new Date(),
          applied: true,
          appliedAt: new Date(),
        });
      }

      this.versionManager.setCurrentVersion(toVersion);

      return {
        success: true,
        fromVersion: currentVersion,
        toVersion,
        migrationsRun,
        migrationsRolledBack,
      };
    } catch (error) {
      return {
        success: false,
        fromVersion,
        toVersion,
        migrationsRun: [],
        migrationsRolledBack: [],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.destroy();
    }
  }

  public getDeploymentPlan(
    fromVersion: string | undefined,
    toVersion: string,
  ): {
    plan: Array<{
      action: "run" | "rollback";
      migration: string;
      order: number;
    }>;
    summary: string;
  } {
    return this.versionManager.generateDeploymentPlan(fromVersion, toVersion);
  }

  public getAllVersions(): VersionMigrationMapping[] {
    return this.versionManager.getAllVersions();
  }

  public getCurrentVersion(): string | undefined {
    return this.versionManager.getCurrentVersion();
  }

  public setCurrentVersion(version: string): void {
    this.versionManager.setCurrentVersion(version);
  }

  public validateVersionMigrations(version: string): boolean {
    const allMigrations = this.fileManager.readMigrationFiles();
    const migrationIds = allMigrations.map((m) => m.timestamp);
    return this.versionManager.validateVersionMigrations(version, migrationIds);
  }
}
