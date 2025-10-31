import chalk from "chalk";

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
    let output = `\n${chalk.red("❌")} ${chalk.red.bold(this.message)}\n`;

    if (this.suggestions.length > 0) {
      output += `\n${chalk.cyan("💡 Suggestions:")}\n`;
      this.suggestions.forEach((suggestion) => {
        output += `  ${chalk.gray("•")} ${suggestion}\n`;
      });
    }

    if (this.helpCommand) {
      output += `\n${chalk.yellow("Need help?")} Run: ${chalk.cyan(this.helpCommand)}\n`;
    }

    return output;
  }
}

export function createMigrationNotFoundError(
  migrationId: string,
): MigrationError {
  return new MigrationError(
    `Migration file not found for ${migrationId}`,
    [
      "Run 'prisma-migrations status' to see all migrations",
      "Check if the migration directory exists in prisma/migrations",
      "The migration may have been deleted - run 'prisma-migrations doctor' to diagnose",
    ],
    "prisma-migrations help",
  );
}

export function createDatabaseConnectionError(error: Error): MigrationError {
  return new MigrationError(
    `Failed to connect to database: ${error.message}`,
    [
      "Check your DATABASE_URL environment variable",
      "Verify the database server is running",
      "Ensure your database credentials are correct",
      "Try running 'prisma db pull' to test the connection",
    ],
    "prisma-migrations help database",
  );
}

export function createInvalidMigrationError(
  migrationId: string,
  reason: string,
): MigrationError {
  return new MigrationError(
    `Migration ${migrationId} is invalid: ${reason}`,
    [
      "Check that migration.sql exists in the migration directory",
      "Verify the SQL syntax is correct",
      "For TypeScript migrations, ensure up() and down() functions are exported",
    ],
    "prisma-migrations help migration-format",
  );
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
      "If this is a development environment, you can run 'prisma-migrations fresh'",
    ],
    "prisma-migrations help checksum",
  );
}

export function createNoMigrationsError(): MigrationError {
  return new MigrationError(
    "No migrations found",
    [
      "Run 'prisma-migrations init' to create your first migration",
      "Or run 'prisma-migrations create <name>' to create a new migration",
      "Check that your migrations directory exists at prisma/migrations",
    ],
    "prisma-migrations help getting-started",
  );
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
    "prisma-migrations help troubleshoot",
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
      "Check if the migration.sql file has rollback SQL",
      "You may need to manually fix the database state",
      "SQL migrations don't support automatic rollback - write manual SQL",
    ],
    "prisma-migrations help rollback",
  );
}

export function createPrismaClientNotFoundError(): MigrationError {
  return new MigrationError(
    "Prisma Client not found",
    [
      "Install Prisma Client: npm install @prisma/client",
      "Run 'prisma generate' to generate the client",
      "Verify @prisma/client is in your dependencies",
    ],
    "prisma-migrations help setup",
  );
}
