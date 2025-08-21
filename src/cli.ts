import { Command } from "commander";
import { MigrationManager } from "./managers/migration";
import { createLogger } from "./utils/logger";
import chalk from "chalk";

const program = new Command();
const logger = createLogger("CLI");

function getManager() {
  return new MigrationManager();
}

program.version("1.0.0").description("Prisma Migrations CLI");

program
  .command("create <name>")
  .description("Create a new migration")
  .action(async (name: string) => {
    try {
      const manager = getManager();
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
  .option("-e, --explain", "Show detailed explanation of changes")
  .action(async ({ to, steps, dryRun, explain }) => {
    try {
      const manager = getManager();
      const result = await manager.runMigrations({
        to,
        steps,
        dryRun,
        explain,
      });

      if (result.diff && (dryRun || explain)) {
        console.log(result.diff);
      }

      if (!dryRun) {
        logger.info(
          { success: result.success, count: result.migrations.length },
          "Migrations applied",
        );
      } else {
        logger.info({ count: result.migrations.length }, "Dry run completed");
      }
    } catch (error) {
      logger.error({ error }, "Error running migrations");
      process.exit(1);
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
  .option("-e, --explain", "Show detailed explanation of changes")
  .action(async ({ to, steps, dryRun, explain }) => {
    try {
      const manager = getManager();
      const result = await manager.rollbackMigrations({
        to,
        steps,
        dryRun,
        explain,
      });

      if (result.diff && (dryRun || explain)) {
        console.log(result.diff);
      }

      if (!dryRun) {
        logger.info(
          { success: result.success, count: result.migrations.length },
          "Migrations rolled back",
        );
      }
    } catch (error) {
      logger.error({ error }, "Error rolling back migrations");
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Get migration status")
  .action(async () => {
    try {
      const manager = getManager();
      const status = await manager.getMigrationStatus();
      console.log(chalk.bold("\nMigration Status:\n"));
      status.forEach(({ name, status, appliedAt }) => {
        const statusColor = status === "applied" ? chalk.green : chalk.yellow;
        console.log(
          `${statusColor("●")} ${name} [${statusColor(status)}] - ${appliedAt ? appliedAt : "Pending"}`,
        );
      });
    } catch (error) {
      logger.error({ error }, "Error retrieving status");
      process.exit(1);
    }
  });

program
  .command("test")
  .description("Test database connection")
  .action(async () => {
    try {
      const manager = getManager();
      const result = await manager.testConnection();
      console.log(`Database connection successful: ${result}`);
    } catch (error) {
      console.error(
        `Error testing connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

program.parse(process.argv);
