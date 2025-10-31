export const ALLOWED_PRISMA_COMMANDS = new Set(["migrate", "db", "generate"]);

export const ALLOWED_MIGRATE_SUBCOMMANDS = new Set([
  "dev",
  "deploy",
  "resolve",
]);

export const ALLOWED_DB_SUBCOMMANDS = new Set(["push"]);

export const DANGEROUS_CHARACTERS = [";", "|", "&", "$", "`", "\n", "\r"];

export const WARNING_MESSAGES = {
  MIGRATION_DOWN: (count: number) =>
    `WARNING: DESTRUCTIVE OPERATION - Rolled back ${count} migration(s)\n\nThis operation has modified your database. Make sure you have backups before running rollback operations in production.`,

  MIGRATION_RESET: (count: number) =>
    `WARNING: DESTRUCTIVE OPERATION - Rolled back ALL ${count} migration(s)\n\nThis operation has reset your entire database migration history. This is typically only safe in development environments. Ensure you have backups before using this in production.`,

  MIGRATION_FRESH: (count: number) =>
    `WARNING: DESTRUCTIVE OPERATION - Fresh complete. Rolled back all migrations and re-applied ${count} migration(s)\n\nThis operation has reset and re-run your entire database migration history. This is typically only safe in development environments. Ensure you have backups before using this in production.`,

  MIGRATION_REFRESH: (down: number, up: number) =>
    `WARNING: DESTRUCTIVE OPERATION - Refresh complete. Rolled back ${down}, applied ${up} migration(s)\n\nThis operation has reset and re-run your entire database migration history. This is typically only safe in development environments. Ensure you have backups before using this in production.`,

  PRISMA_DB_PUSH: (stdout: string, stderr: string) =>
    `WARNING: DESTRUCTIVE OPERATION - Prisma db push completed\n\nThis command pushes schema changes directly to the database without creating migration files. Data loss may occur if schema changes are not compatible with existing data.\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`,
};
