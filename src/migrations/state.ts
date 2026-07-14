import {
  createChecksumMismatchError,
  createMigrationNotFoundError,
} from "../errors";
import { generateChecksum } from "../utils";
import type { DiscoveredMigration } from "./discovery";
import { MigrationRepository } from "./discovery";
import {
  type AppliedMigrationRow,
  getAppliedMigrationId,
  getAppliedMigrationName,
  isAppliedMigration,
  MigrationHistory,
} from "./history";

export interface MigrationState {
  all: DiscoveredMigration[];
  appliedRows: AppliedMigrationRow[];
  appliedIds: string[];
}

type StateResult = Promise<MigrationState>;
type VoidResult = Promise<void>;

function assertAppliedFilesExist(
  all: DiscoveredMigration[],
  rows: AppliedMigrationRow[],
): void {
  const migrationIds = new Set(all.map((migration) => migration.id));
  const missing = rows.find((row) => {
    return !migrationIds.has(getAppliedMigrationId(row));
  });
  if (!missing) return;
  const id = getAppliedMigrationId(missing);
  throw createMigrationNotFoundError(id);
}

function assertLinearHistory(
  all: DiscoveredMigration[],
  appliedIds: string[],
): void {
  const applied = new Set(appliedIds);
  const firstPendingIndex = all.findIndex(
    (migration) => !applied.has(migration.id),
  );
  if (firstPendingIndex < 0) return;
  const laterApplied = all.slice(firstPendingIndex + 1).find((migration) => {
    return applied.has(migration.id);
  });
  if (!laterApplied) return;
  const firstPending = all[firstPendingIndex];
  throw new Error(
    `Migration history is out of order: ${laterApplied.id} is applied before ${firstPending.id}`,
  );
}

async function validateChecksums(
  all: DiscoveredMigration[],
  rows: AppliedMigrationRow[],
): VoidResult {
  const migrationsById = new Map(
    all.map((migration) => [migration.id, migration]),
  );
  await rows.reduce(async (previous, row) => {
    await previous;
    if (!row.checksum) return;
    const id = getAppliedMigrationId(row);
    const migration = migrationsById.get(id)!;
    const checksum = await generateChecksum(migration.path);
    if (checksum === row.checksum) return;
    throw createChecksumMismatchError(getAppliedMigrationName(row));
  }, Promise.resolve());
}

export async function loadMigrationState(
  repository: MigrationRepository,
  history: MigrationHistory,
  shouldValidateChecksums: boolean,
): StateResult {
  const all = await repository.all();
  const rows = await history.rows();
  history.assertNoFailedMigrations(rows);
  const appliedRows = rows.filter(isAppliedMigration);
  const appliedIds = appliedRows.map(getAppliedMigrationId);
  assertAppliedFilesExist(all, appliedRows);
  assertLinearHistory(all, appliedIds);
  if (shouldValidateChecksums) await validateChecksums(all, appliedRows);
  return { all, appliedRows, appliedIds };
}
