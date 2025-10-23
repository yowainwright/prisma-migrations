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

export async function down(
  prisma: PrismaClient,
  steps: number = 1,
  config?: MigrationsConfig,
  interactive?: boolean,
) {
  const migrations = new Migrations(prisma, config);

  if (interactive) {
    return await interactiveDown(migrations);
  }

  const spinner = ora("Rolling back migrations...").start();

  try {
    const count = await migrations.down(steps);
    spinner.succeed(chalk.green(`Rolled back ${count} migration(s)`));

    const hasRolledBack = count > 0;
    if (hasRolledBack) {
      showRollbackTable(count);
    }

    return count;
  } catch (error) {
    spinner.fail(chalk.red("Rollback failed"));
    logger.error(error);
    throw error;
  }
}

export async function interactiveDown(migrations: Migrations) {
  const applied = await migrations.applied();
  const hasApplied = applied.length > 0;

  if (!hasApplied) {
    console.log(chalk.yellow("No applied migrations to rollback"));
    return 0;
  }

  const mode = await promptDownMode();
  const count = await runRollbackForMode(mode, migrations, applied);

  const hasRolledBack = count > 0;
  if (hasRolledBack) {
    showRollbackTable(count);
  }

  return count;
}

export async function promptDownMode(): Promise<string> {
  const choices = [
    { name: chalk.cyan("Last migration only"), value: "one" },
    { name: chalk.yellow("Select number of migrations"), value: "steps" },
    {
      name: chalk.blue("Select specific migration to rollback to"),
      value: "specific",
    },
    { name: chalk.red("All migrations (reset)"), value: "all" },
  ];

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "How many migrations do you want to rollback?",
      choices,
    },
  ]);

  return mode;
}

export async function runRollbackForMode(
  mode: string,
  migrations: Migrations,
  applied: MigrationFile[],
): Promise<number> {
  const isOneMode = mode === "one";
  if (isOneMode) {
    return await rollbackOne(migrations);
  }

  const isAllMode = mode === "all";
  if (isAllMode) {
    return await rollbackAll(migrations);
  }

  const isStepsMode = mode === "steps";
  if (isStepsMode) {
    return await rollbackSteps(migrations, applied);
  }

  const isSpecificMode = mode === "specific";
  if (isSpecificMode) {
    return await rollbackToSpecific(migrations, applied);
  }

  return 0;
}

export async function rollbackOne(migrations: Migrations): Promise<number> {
  const spinner = ora("Rolling back migration...").start();

  try {
    const count = await migrations.down(1);
    spinner.succeed(chalk.green(`Rolled back ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Rollback failed"));
    logger.error(error);
    throw error;
  }
}

export async function rollbackAll(migrations: Migrations): Promise<number> {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: chalk.red("Are you sure you want to rollback ALL migrations?"),
      default: false,
    },
  ]);

  const isConfirmed = confirm === true;
  if (!isConfirmed) {
    console.log(chalk.yellow("Cancelled"));
    return 0;
  }

  const spinner = ora("Rolling back all migrations...").start();

  try {
    const count = await migrations.reset();
    spinner.succeed(chalk.green(`Rolled back ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Rollback failed"));
    logger.error(error);
    throw error;
  }
}

export async function rollbackSteps(
  migrations: Migrations,
  applied: MigrationFile[],
): Promise<number> {
  const { steps } = await inquirer.prompt([
    {
      type: "number",
      name: "steps",
      message: `How many migrations? (1-${applied.length})`,
      default: 1,
      validate: (input: number) => {
        const isValid = input >= 1 && input <= applied.length;
        if (!isValid) {
          return `Please enter a number between 1 and ${applied.length}`;
        }
        return true;
      },
    },
  ]);

  const spinner = ora("Rolling back migrations...").start();

  try {
    const count = await migrations.down(steps);
    spinner.succeed(chalk.green(`Rolled back ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Rollback failed"));
    logger.error(error);
    throw error;
  }
}

export async function rollbackToSpecific(
  migrations: Migrations,
  applied: MigrationFile[],
): Promise<number> {
  const migrationChoices = applied.map((m) => ({
    name: `${m.id}_${m.name}`,
    value: m.id,
  }));

  const { migrationId } = await inquirer.prompt([
    {
      type: "list",
      name: "migrationId",
      message: "Rollback down to (this migration will remain applied):",
      choices: migrationChoices,
    },
  ]);

  const spinner = ora("Rolling back migrations...").start();

  try {
    const count = await migrations.downTo(migrationId);
    spinner.succeed(chalk.green(`Rolled back ${count} migration(s)`));
    return count;
  } catch (error) {
    spinner.fail(chalk.red("Rollback failed"));
    logger.error(error);
    throw error;
  }
}

export function showRollbackTable(count: number): void {
  const table = new Table({
    head: [chalk.cyan("Status"), chalk.cyan("Migrations")],
    colWidths: [10, 50],
  });
  table.push([chalk.yellow("↓"), `${count} migration(s) rolled back`]);
  console.log(table.toString());
}
