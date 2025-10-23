import type {
  PrismaClient,
  MigrationsConfig,
  MigrationFile,
} from "../../../types";
import { Migrations } from "../../../migrations";
import { logger } from "../../../logger";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import Table from "cli-table3";

export async function up(
  prisma: PrismaClient,
  steps?: number,
  config?: MigrationsConfig,
  interactive?: boolean,
) {
  const migrations = new Migrations(prisma, config);

  if (interactive) {
    return await interactiveUp(migrations);
  }

  const spinner = ora("Loading migrations...").start();

  try {
    spinner.text = "Running migrations...";
    const count = await migrations.up(steps);
    spinner.succeed(chalk.green(`Applied ${count} migration(s)`));

    const hasAppliedMigrations = count > 0;
    if (hasAppliedMigrations) {
      showSuccessTable(count);
    }

    return count;
  } catch (error) {
    spinner.fail(chalk.red("Migration failed"));
    logger.error(error);
    throw error;
  }
}

export async function interactiveUp(migrations: Migrations) {
  const pending = await migrations.pending();
  const hasPending = pending.length > 0;

  if (!hasPending) {
    console.log(chalk.green("No pending migrations"));
    return 0;
  }

  const mode = await promptUpMode();
  const count = await runMigrationsForMode(mode, migrations, pending);

  const hasAppliedMigrations = count > 0;
  if (hasAppliedMigrations) {
    showSuccessTable(count);
  }

  return count;
}

export async function promptUpMode(): Promise<string> {
  const choices = [
    { name: chalk.cyan("All pending migrations"), value: "all" },
    { name: chalk.yellow("Select number of migrations"), value: "steps" },
    {
      name: chalk.blue("Select specific migration to run up to"),
      value: "specific",
    },
  ];

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "How many migrations do you want to run?",
      choices,
    },
  ]);

  return mode;
}

export async function runMigrationsForMode(
  mode: string,
  migrations: Migrations,
  pending: MigrationFile[],
): Promise<number> {
  const isAllMode = mode === "all";
  if (isAllMode) {
    return await runAllMigrations(migrations);
  }

  const isStepsMode = mode === "steps";
  if (isStepsMode) {
    return await runStepsMigrations(migrations, pending);
  }

  const isSpecificMode = mode === "specific";
  if (isSpecificMode) {
    return await runToSpecificMigration(migrations, pending);
  }

  return 0;
}

export async function runAllMigrations(
  migrations: Migrations,
): Promise<number> {
  const spinner = ora("Running migrations...").start();

  try {
    const count = await migrations.up();
    spinner.succeed(chalk.green(`Applied ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Migration failed"));
    logger.error(error);
    throw error;
  }
}

export async function runStepsMigrations(
  migrations: Migrations,
  pending: MigrationFile[],
): Promise<number> {
  const { steps } = await inquirer.prompt([
    {
      type: "number",
      name: "steps",
      message: `How many migrations? (1-${pending.length})`,
      default: 1,
      validate: (input: number) => {
        const isValid = input >= 1 && input <= pending.length;
        if (!isValid) {
          return `Please enter a number between 1 and ${pending.length}`;
        }
        return true;
      },
    },
  ]);

  const spinner = ora("Running migrations...").start();

  try {
    const count = await migrations.up(steps);
    spinner.succeed(chalk.green(`Applied ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Migration failed"));
    logger.error(error);
    throw error;
  }
}

export async function runToSpecificMigration(
  migrations: Migrations,
  pending: MigrationFile[],
): Promise<number> {
  const migrationChoices = pending.map((m) => ({
    name: `${m.id}_${m.name}`,
    value: m.id,
  }));

  const { migrationId } = await inquirer.prompt([
    {
      type: "list",
      name: "migrationId",
      message: "Run migrations up to (inclusive):",
      choices: migrationChoices,
    },
  ]);

  const spinner = ora("Running migrations...").start();

  try {
    const count = await migrations.upTo(migrationId);
    spinner.succeed(chalk.green(`Applied ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Migration failed"));
    logger.error(error);
    throw error;
  }
}

export function showSuccessTable(count: number): void {
  const table = new Table({
    head: [chalk.cyan("Status"), chalk.cyan("Migrations")],
    colWidths: [10, 50],
  });
  table.push([chalk.green("✓"), `${count} migration(s) applied successfully`]);
  console.log(table.toString());
}
