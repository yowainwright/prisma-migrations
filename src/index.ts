export { MigrationManager } from './migration-manager';
export { ConfigManager } from './config';
export { FileManager } from './file-manager';
export { DatabaseAdapter } from './database-adapter';

export * from './types';

// Re-export for convenience
import { MigrationManager } from './migration-manager';
export default MigrationManager;

// Export types for easier usage
export type { PrismaMigration, FunctionMigrationTemplate, MigrationContext } from './types';
