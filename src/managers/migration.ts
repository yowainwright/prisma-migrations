import { ConfigManager } from "../utils/config";
import { FileManager } from "./file";
import { DatabaseAdapter } from "../adapters/database";
import { VersionManager } from "./version";
import { DiffGenerator } from "../api/diff";
import { createLogger } from "../utils/logger";
import type { PrismaClientLike } from "../api/migration";
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
  private dbAdapter: DatabaseAdapter;
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

    const databaseUrl = this.config.getDatabaseUrl();
    this.dbAdapter = new DatabaseAdapter(
      databaseUrl,
      tableName,
      prismaClient as PrismaClientLike | undefined,
      logger,
    );
  }

  private async ensureConfigLoaded(): Promise<void> {
    const config = await this.config.getConfigAsync();
    const { migrationsDir, tableName, prismaClient, logger } = config;
    this.logger = createLogger("MigrationManager", logger);
    this.fileManager = new FileManager(migrationsDir, config);
    this.versionManager = new VersionManager(migrationsDir);

    const databaseUrl = this.config.getDatabaseUrl();
    this.dbAdapter = new DatabaseAdapter(
      databaseUrl,
      tableName,
      prismaClient as PrismaClientLike | undefined,
      logger,
    );
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing migration manager...");
      await this.dbAdapter.connect();
      await this.dbAdapter.ensureMigrationsTable();
      this.logger.info("Migration manager initialized successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize");
      throw error;
    }
  }

  public async destroy(): Promise<void> {
    await this.dbAdapter.disconnect();
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

  public async runMigrations(
    options: RunMigrationOptions = {},
  ): Promise<MigrationResult & { diff?: string }> {
    const {
      to,
      steps,
      dryRun = false,
      force = false,
      explain = false,
    } = options;

    try {
      await this.initialize();

      let migrationsToRun: MigrationFile[] = [];

      if (to) {
        const targetMigration =
          this.fileManager.getMigrationFile(to) ||
          this.fileManager.getMigrationByName(to);
        if (!targetMigration) {
          throw new Error(`Migration '${to}' not found`);
        }
        migrationsToRun = this.getMigrationsUpTo(targetMigration.timestamp);
      } else if (steps) {
        migrationsToRun = this.getMigrationsToRun(steps);
      } else {
        migrationsToRun = this.getAllPendingMigrations();
      }

      let diff: string | undefined;
      if (dryRun || explain) {
        diff = migrationsToRun
          .map((migration) => this.diffGenerator.formatDiff(migration, "up"))
          .join("\n\n");
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

      const appliedMigrations: Migration[] = [];

      for (const migrationFile of migrationsToRun) {
        const isApplied = await this.dbAdapter.isMigrationApplied(
          migrationFile.timestamp,
        );

        if (isApplied && !force) {
          continue;
        }

        await this.dbAdapter.executeInTransaction(async () => {
          if (migrationFile.type === "sql") {
            const { up } =
              this.fileManager.parseMigrationContent(migrationFile);
            await this.dbAdapter.executeMigration(up);
          } else {
            await this.dbAdapter.executeMigrationFile(migrationFile, "up");
          }
          await this.dbAdapter.recordMigration(
            migrationFile.timestamp,
            migrationFile.name,
          );
        });

        appliedMigrations.push({
          id: migrationFile.timestamp,
          name: migrationFile.name,
          filename: migrationFile.path,
          timestamp: new Date(),
          applied: true,
          appliedAt: new Date(),
        });
      }

      return {
        success: true,
        migrations: appliedMigrations,
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

  public async rollbackMigrations(
    options: RollbackMigrationOptions = {},
  ): Promise<MigrationResult & { diff?: string }> {
    const {
      to,
      steps,
      dryRun = false,
      force = false,
      explain = false,
    } = options;

    try {
      await this.initialize();

      const appliedMigrations = await this.dbAdapter.getAppliedMigrations();
      let migrationsToRollback: Migration[] = [];

      if (to) {
        const targetMigration =
          this.fileManager.getMigrationFile(to) ||
          this.fileManager.getMigrationByName(to);
        if (!targetMigration) {
          throw new Error(`Migration '${to}' not found`);
        }
        migrationsToRollback = this.getMigrationsToRollbackTo(
          appliedMigrations,
          targetMigration.timestamp,
        );
      } else if (steps) {
        migrationsToRollback = appliedMigrations.slice(-steps).reverse();
      } else {
        const lastMigration = await this.dbAdapter.getLastMigration();
        if (lastMigration) {
          migrationsToRollback = [lastMigration];
        }
      }

      let diff: string | undefined;
      if (dryRun || explain) {
        const migrationFiles = migrationsToRollback.map((m) => {
          const file = this.fileManager.getMigrationFile(m.id);
          if (!file) throw new Error(`Migration file not found for ${m.id}`);
          return file;
        });
        diff = migrationFiles
          .map((migration) => this.diffGenerator.formatDiff(migration, "down"))
          .join("\n\n");
      }

      if (dryRun) {
        return {
          success: true,
          migrations: migrationsToRollback,
          diff,
        };
      }

      const rolledBackMigrations: Migration[] = [];

      for (const migration of migrationsToRollback) {
        const migrationFile = this.fileManager.getMigrationFile(migration.id);
        if (!migrationFile) {
          throw new Error(`Migration file not found for ${migration.id}`);
        }

        await this.dbAdapter.executeInTransaction(async () => {
          if (migrationFile.type === "sql") {
            const { down } =
              this.fileManager.parseMigrationContent(migrationFile);

            if (!down || down.trim().length === 0) {
              if (!force) {
                throw new Error(
                  `No rollback SQL found for migration ${migration.name}`,
                );
              }
              return;
            }

            await this.dbAdapter.executeMigration(down);
          } else {
            try {
              await this.dbAdapter.executeMigrationFile(migrationFile, "down");
            } catch (error) {
              if (!force) {
                throw new Error(
                  `Failed to rollback migration ${migration.name}: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
              return;
            }
          }
          await this.dbAdapter.removeMigration(migration.id);
        });

        rolledBackMigrations.push({
          ...migration,
          applied: false,
        });
      }

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

    const allMigrations = this.fileManager.readMigrationFiles();
    const appliedMigrations = await this.dbAdapter.getAppliedMigrations();

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

    const allMigrations = this.fileManager.readMigrationFiles();
    const appliedMigrations = await this.dbAdapter.getAppliedMigrations();

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
      const result = await this.dbAdapter.testConnection();
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

        await this.dbAdapter.executeInTransaction(async () => {
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
            await this.dbAdapter.executeMigration(down);
          } else {
            await this.dbAdapter.executeMigrationFile(migrationFile, "down");
          }
          await this.dbAdapter.removeMigration(migrationId);
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

        const isApplied = await this.dbAdapter.isMigrationApplied(migrationId);
        if (isApplied && !force) {
          continue;
        }

        await this.dbAdapter.executeInTransaction(async () => {
          if (migrationFile.type === "sql") {
            const { up } =
              this.fileManager.parseMigrationContent(migrationFile);
            await this.dbAdapter.executeMigration(up);
          } else {
            await this.dbAdapter.executeMigrationFile(migrationFile, "up");
          }
          await this.dbAdapter.recordMigration(migrationId, migrationFile.name);
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
