import { Command } from "commander";
import { MigrationManager } from "./migration-manager";

const program = new Command();
const manager = new MigrationManager();

program.version("1.0.0").description("Prisma Migrations CLI");

program
  .command("create <name>")
  .description("Create a new migration")
  .action(async (name: string) => {
    try {
      await manager.createMigration({ name });
      console.log(`Migration '${name}' created successfully.`);
    } catch (error) {
      console.error(
        `Error creating migration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

program
  .command("up")
  .description("Run all pending migrations")
  .option("-t, --to <timestamp>", "Run up to a specific migration")
  .option(
    "-s, --steps <number>",
    "Run a specific number of migrations",
    parseInt,
  )
  .option("-d, --dry-run", "Preview migrations without applying")
  .action(async ({ to, steps, dryRun }) => {
    try {
      const result = await manager.runMigrations({ to, steps, dryRun });
      console.log(`Migrations applied successfully: ${result.success}`);
    } catch (error) {
      console.error(
        `Error running migrations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

program
  .command("down")
  .description("Rollback migrations")
  .option("-t, --to <timestamp>", "Rollback to a specific migration")
  .option(
    "-s, --steps <number>",
    "Rollback a specific number of migrations",
    parseInt,
  )
  .option("-d, --dry-run", "Preview rollback without applying")
  .action(async ({ to, steps, dryRun }) => {
    try {
      const result = await manager.rollbackMigrations({ to, steps, dryRun });
      console.log(`Migrations rolled back successfully: ${result.success}`);
    } catch (error) {
      console.error(
        `Error rolling back migrations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

program
  .command("status")
  .description("Get migration status")
  .action(async () => {
    try {
      const status = await manager.getMigrationStatus();
      status.forEach(({ name, status, appliedAt }) => {
        console.log(
          `${name} [${status}] - ${appliedAt ? appliedAt : "Pending"}`,
        );
      });
    } catch (error) {
      console.error(
        `Error retrieving status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

program
  .command("test")
  .description("Test database connection")
  .action(async () => {
    try {
      const result = await manager.testConnection();
      console.log(`Database connection successful: ${result}`);
    } catch (error) {
      console.error(
        `Error testing connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

program.parse(process.argv);
