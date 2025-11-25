import { colors } from "../utils/colors";

export class MigrationError extends Error {
  constructor(
    message: string,
    public suggestions: string[] = [],
    public helpCommand?: string,
  ) {
    super(message);
    this.name = "MigrationError";
  }

  format(): string {
    let output = `\n${colors.bold(colors.red(this.message))}\n`;

    if (this.suggestions.length > 0) {
      output += `\n${colors.cyan("Suggestions:")}\n`;
      this.suggestions.forEach((suggestion) => {
        output += `  ${colors.gray("•")} ${suggestion}\n`;
      });
    }

    if (this.helpCommand) {
      output += `\n${colors.yellow("Need help?")} Run: ${colors.cyan(this.helpCommand)}\n`;
    }

    return output;
  }
}

export function createMigrationNotFoundError(
  migrationId: string,
): MigrationError {
  return new MigrationError(`Migration file not found for ${migrationId}`, [
    "Run 'prisma-migrations status' to see all migrations",
    "Check if the migration directory exists in prisma/migrations",
    "The migration file may have been deleted or moved",
  ]);
}

export function createDatabaseConnectionError(error: Error): MigrationError {
  return new MigrationError(`Failed to connect to database: ${error.message}`, [
    "Check your DATABASE_URL environment variable",
    "Verify the database server is running",
    "Ensure your database credentials are correct",
    "Try running 'prisma db pull' to test the connection",
  ]);
}

export function createInvalidMigrationError(
  migrationId: string,
  reason: string,
): MigrationError {
  return new MigrationError(`Migration ${migrationId} is invalid: ${reason}`, [
    "Check that migration.sql exists in the migration directory",
    "Ensure the file contains both '-- Migration: Up' and '-- Migration: Down' markers",
    "Verify the SQL syntax is correct",
  ]);
}

export function createChecksumMismatchError(
  migrationId: string,
): MigrationError {
  return new MigrationError(
    `Migration ${migrationId} has been modified after being applied`,
    [
      "The migration file content has changed since it was applied",
      "Never modify migrations that have been applied to production",
      "Create a new migration instead to make schema changes",
      "If this is a development environment, you can run 'prisma-migrations fresh --force'",
    ],
  );
}

export function createNoMigrationsError(): MigrationError {
  return new MigrationError("No migrations found", [
    "Run 'prisma-migrations init' to create your first migration",
    "Or run 'prisma-migrations create <name>' to create a new migration",
    "Check that your migrations directory exists at prisma/migrations",
  ]);
}

export function createMigrationFailedError(
  migrationId: string,
  error: Error,
): MigrationError {
  return new MigrationError(
    `Migration ${migrationId} failed: ${error.message}`,
    [
      "Check the SQL syntax in your migration file",
      "Verify that all referenced tables and columns exist",
      "Review the database logs for more details",
      "You may need to rollback: 'prisma-migrations down'",
    ],
  );
}

export function createRollbackFailedError(
  migrationId: string,
  error: Error,
): MigrationError {
  return new MigrationError(
    `Rollback of ${migrationId} failed: ${error.message}`,
    [
      "The migration may have made irreversible changes",
      "Check that the '-- Migration: Down' section has valid rollback SQL",
      "You may need to manually fix the database state",
      "Verify the SQL syntax in the down section is correct",
    ],
  );
}

export function createPrismaClientNotFoundError(): MigrationError {
  return new MigrationError("Prisma Client not found", [
    "Install Prisma Client: npm install @prisma/client",
    "Run 'prisma generate' to generate the client",
    "Verify @prisma/client is in your dependencies",
  ]);
}

export function createMigrationLockTimeoutError(
  timeoutMs: number,
): MigrationError {
  const timeoutSeconds = timeoutMs / 1000;

  return new MigrationError(
    `Failed to acquire migration lock after ${timeoutSeconds}s`,
    [
      "Another migration is running",
      "",
      "Concurrent deployment detected:",
      "  Use upIfNotLocked() to skip if another instance is migrating",
      "  Or increase timeout: new Migrations(prisma, { lockTimeout: 120000 })",
      "",
      "Check lock status:",
      "  npx prisma-migrations lock check",
      "",
      "Release stuck lock:",
      "  npx prisma-migrations lock release",
    ],
  );
}

export function createTransactionFailedError(
  migrationId: string,
  error: Error,
): MigrationError {
  return new MigrationError(
    `Transaction failed for migration ${migrationId}: ${error.message}`,
    [
      "The migration was rolled back automatically",
      "No changes were applied to the database",
      "Check the SQL syntax and fix the migration",
      "Review the error message above for details",
    ],
  );
}
