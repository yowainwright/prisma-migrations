export { MigrationManager } from "./managers/migration";
export { ConfigManager } from "./utils/config";
export { FileManager } from "./managers/file";
export { DatabaseAdapter } from "./adapters/database";
export { VersionManager } from "./managers/version";
export { CommitManager } from "./managers/commit";
export { DiffGenerator } from "./api/diff";
export { setGlobalLogger, getDefaultLogger } from "./utils/logger";

export {
  createMigrationContext,
  defineMigration,
  sql,
  type MigrationContext,
  type Migration,
  type MigrationFunction,
  type PrismaClientLike,
} from "./api/migration";

export * from "./utils/types";

import { MigrationManager } from "./managers/migration";
export default MigrationManager;
