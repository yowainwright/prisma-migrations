import type { MigrationFile, MigrationStatus, PrismaClient } from "../types";
import { createMigrationNotFoundError } from "../errors";
import { logger } from "../logger";
import { MigrationRepository, type DiscoveredMigration } from "./discovery";
import { MigrationExecutor } from "./executor";
import { MigrationHistory } from "./history";
import { MigrationLock } from "./locking";
import { loadMigrationState, type MigrationState } from "./state";

export interface MigrationHooks {
  beforeUp?: () => void | Promise<void>;
  afterUp?: () => void | Promise<void>;
  beforeDown?: () => void | Promise<void>;
  afterDown?: () => void | Promise<void>;
}

export interface MigrationsOptions {
  migrationsDir?: string;
  disableLocking?: boolean;
  skipChecksumValidation?: boolean;
  lockTimeout?: number;
  lockLeaseDuration?: number;
  hooks?: MigrationHooks;
}

type AsyncResult<T> = Promise<T>;
type BooleanResult = Promise<boolean>;
type NumberResult = Promise<number>;
type VoidResult = Promise<void>;
type StateResult = Promise<MigrationState>;
type MigrationIndex = Map<string, DiscoveredMigration>;
type MigrationListResult = Promise<MigrationFile[]>;
type OptionalMigrationResult = Promise<MigrationFile | null>;
type StatusResult = Promise<MigrationStatus[]>;
type RefreshResult = Promise<{ down: number; up: number }>;
type ConditionalUpResult = Promise<{
  ran: boolean;
  count: number;
  reason?: string;
}>;

function validateSteps(steps: number | undefined, name = "steps"): void {
  if (steps === undefined) return;
  const isValid = Number.isSafeInteger(steps) && steps > 0;
  if (!isValid) throw new Error(`${name} must be a positive integer`);
}

async function runSequential(
  migrations: DiscoveredMigration[],
  run: (migration: DiscoveredMigration) => VoidResult,
): VoidResult {
  await migrations.reduce(async (previous, migration) => {
    await previous;
    await run(migration);
  }, Promise.resolve());
}

function indexMigrations(migrations: DiscoveredMigration[]): MigrationIndex {
  const entries = migrations.map((migration) => {
    const entry: [string, DiscoveredMigration] = [migration.id, migration];
    return entry;
  });
  return new Map(entries);
}

function resolveMigrations(
  all: DiscoveredMigration[],
  ids: string[],
): DiscoveredMigration[] {
  const migrationsById = indexMigrations(all);
  return ids.map((id) => {
    const migration = migrationsById.get(id);
    if (!migration) throw createMigrationNotFoundError(id);
    return migration;
  });
}

function selectPending(state: MigrationState): DiscoveredMigration[] {
  const applied = new Set(state.appliedIds);
  return state.all.filter((migration) => !applied.has(migration.id));
}

function limitMigrations(
  migrations: DiscoveredMigration[],
  steps: number | undefined,
): DiscoveredMigration[] {
  if (steps === undefined) return migrations;
  return migrations.slice(0, steps);
}

export class Migrations {
  private readonly repository: MigrationRepository;
  private readonly history: MigrationHistory;
  private readonly executor: MigrationExecutor;
  private readonly lock: MigrationLock | null;
  private readonly skipChecksumValidation: boolean;
  private readonly lockTimeout: number;
  private readonly hooks: MigrationHooks;

  constructor(prisma: PrismaClient, options: MigrationsOptions = {}) {
    const migrationsDir = options.migrationsDir ?? "./prisma/migrations";
    this.repository = new MigrationRepository(migrationsDir);
    this.history = new MigrationHistory(prisma);
    this.executor = new MigrationExecutor(prisma, this.history);
    this.skipChecksumValidation = options.skipChecksumValidation ?? false;
    this.lockTimeout = options.lockTimeout ?? 30000;
    this.hooks = options.hooks ?? {};
    const lockingDisabled = options.disableLocking ?? false;
    const leaseDuration = options.lockLeaseDuration;
    this.lock = lockingDisabled
      ? null
      : new MigrationLock(prisma, leaseDuration);
  }

  private state(validateChecksums: boolean): StateResult {
    const shouldValidate = validateChecksums && !this.skipChecksumValidation;
    return loadMigrationState(this.repository, this.history, shouldValidate);
  }

  private withMigrationLock<T>(fn: () => AsyncResult<T>) {
    if (!this.lock) return fn();
    return this.lock.withLock(fn, this.lockTimeout);
  }

  async dryRun(steps?: number): MigrationListResult {
    validateSteps(steps);
    const pending = await this.pending();
    return limitMigrations(pending as DiscoveredMigration[], steps);
  }

  async up(steps?: number): NumberResult {
    validateSteps(steps);
    return this.withMigrationLock(() => this.runUpMigrations(steps));
  }

  private async runUpMigrations(steps?: number): NumberResult {
    await this.hooks.beforeUp?.();
    const state = await this.state(true);
    const pending = selectPending(state);
    const migrations = limitMigrations(pending, steps);
    await runSequential(migrations, (migration) => {
      return this.executor.run(migration, "up");
    });
    await this.hooks.afterUp?.();
    return migrations.length;
  }

  async down(steps = 1): NumberResult {
    validateSteps(steps);
    return this.withMigrationLock(() => this.runDownMigrations(steps));
  }

  private async runDownMigrations(steps: number): NumberResult {
    await this.hooks.beforeDown?.();
    const state = await this.state(true);
    const ids = state.appliedIds.slice(-steps).toReversed();
    const migrations = resolveMigrations(state.all, ids);
    await runSequential(migrations, (migration) => {
      return this.executor.run(migration, "down");
    });
    await this.hooks.afterDown?.();
    return migrations.length;
  }

  async status(): StatusResult {
    const state = await this.state(false);
    const applied = new Set(state.appliedIds);
    return state.all.map((migration) => {
      const isApplied = applied.has(migration.id);
      return { migration, applied: isApplied };
    });
  }

  async pending(): MigrationListResult {
    const state = await this.state(false);
    return selectPending(state);
  }

  async applied(): MigrationListResult {
    const state = await this.state(false);
    return resolveMigrations(state.all, state.appliedIds);
  }

  async latest(): OptionalMigrationResult {
    const applied = await this.applied();
    if (applied.length === 0) return null;
    return applied[applied.length - 1];
  }

  async reset(): NumberResult {
    return this.withMigrationLock(() => this.runResetMigrations());
  }

  private async runResetMigrations(): NumberResult {
    await this.hooks.beforeDown?.();
    const state = await this.state(true);
    const ids = state.appliedIds.toReversed();
    const migrations = resolveMigrations(state.all, ids);
    await runSequential(migrations, (migration) => {
      return this.executor.run(migration, "down");
    });
    await this.hooks.afterDown?.();
    return migrations.length;
  }

  async fresh(): NumberResult {
    return this.withMigrationLock(async () => {
      await this.runResetMigrations();
      return this.runUpMigrations();
    });
  }

  async refresh(): RefreshResult {
    return this.withMigrationLock(async () => {
      const down = await this.runResetMigrations();
      const up = await this.runUpMigrations();
      return { down, up };
    });
  }

  async upTo(migrationId: string): NumberResult {
    return this.withMigrationLock(() => this.runUpToMigration(migrationId));
  }

  private async runUpToMigration(migrationId: string): NumberResult {
    await this.hooks.beforeUp?.();
    const state = await this.state(true);
    const pending = selectPending(state);
    const targetIndex = pending.findIndex((migration) => {
      return migration.id === migrationId;
    });
    if (targetIndex < 0) {
      throw new Error(
        `Migration ${migrationId} not found in pending migrations`,
      );
    }
    const migrations = pending.slice(0, targetIndex + 1);
    await runSequential(migrations, (migration) => {
      return this.executor.run(migration, "up");
    });
    await this.hooks.afterUp?.();
    return migrations.length;
  }

  async downTo(migrationId: string): NumberResult {
    return this.withMigrationLock(() => this.runDownToMigration(migrationId));
  }

  private async runDownToMigration(migrationId: string): NumberResult {
    await this.hooks.beforeDown?.();
    const state = await this.state(true);
    const targetIndex = state.appliedIds.indexOf(migrationId);
    if (targetIndex < 0) {
      throw new Error(
        `Migration ${migrationId} not found in applied migrations`,
      );
    }
    const ids = state.appliedIds.slice(targetIndex + 1).toReversed();
    const migrations = resolveMigrations(state.all, ids);
    await runSequential(migrations, (migration) => {
      return this.executor.run(migration, "down");
    });
    await this.hooks.afterDown?.();
    return migrations.length;
  }

  async upIfNotLocked(steps?: number): ConditionalUpResult {
    validateSteps(steps);
    if (!this.lock) {
      const count = await this.runUpMigrations(steps);
      return { ran: true, count };
    }
    const result = await this.lock.tryLock(() => this.runUpMigrations(steps));
    if (!result.acquired) {
      const reason = "Another instance is running migrations";
      logger.info(`${reason}, skipping`);
      return { ran: false, count: 0, reason };
    }
    const count = result.result ?? 0;
    return { ran: true, count };
  }

  async checkLockStatus(): BooleanResult {
    if (!this.lock) {
      logger.warn("Locking is disabled");
      return false;
    }
    return this.lock.isLocked();
  }

  async releaseLock(): VoidResult {
    if (!this.lock) {
      logger.warn("Locking is disabled, no lock to release");
      return;
    }
    await this.lock.forceRelease();
  }
}
