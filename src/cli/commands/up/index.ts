import type { PrismaClient, MigrationFile } from "../../../types";
import { Migrations } from "../../../migrations";
import { logger } from "../../../logger";
import { Prompt, type PromptChoice } from "../../../utils/prompts";
import { spinner, createTable, colors } from "../../../utils";

export async function up(
  prisma: PrismaClient,
  steps?: number,
  config?: { migrationsDir?: string },
  interactive?: boolean,
) {
  const migrations = new Migrations(prisma, config);

  if (interactive) {
    return await interactiveUp(migrations);
  }

  const spin = spinner("Loading migrations...").start();

  try {
    spin.text = "Running migrations...";
    const count = await migrations.up(steps);
    spin.succeed(`Applied ${count} migration(s)`);

    const hasAppliedMigrations = count > 0;
    if (hasAppliedMigrations) {
      showSuccessTable(count);
    }

    return count;
  } catch (error) {
    spin.fail("Migration failed");
    logger.error(error);
    throw error;
  }
}

export async function interactiveUp(migrations: Migrations) {
  const pending = await migrations.pending();
  const hasPending = pending.length > 0;

  if (!hasPending) {
    console.log(colors.green("No pending migrations"));
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
  const choices: PromptChoice[] = [
    { name: colors.cyan("All pending migrations"), value: "all" },
    { name: colors.yellow("Select number of migrations"), value: "steps" },
    {
      name: colors.blue("Select specific migration to run up to"),
      value: "specific",
    },
  ];

  const prompt = new Prompt();
  const mode = await prompt.list(
    "How many migrations do you want to run?",
    choices,
  );
  prompt.close();

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
  const spin = spinner("Running migrations...").start();

  try {
    const count = await migrations.up();
    spin.succeed(`Applied ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Migration failed");
    logger.error(error);
    throw error;
  }
}

export async function runStepsMigrations(
  migrations: Migrations,
  pending: MigrationFile[],
): Promise<number> {
  const prompt = new Prompt();
  const steps = await prompt.number(
    `How many migrations? (1-${pending.length})`,
    1,
    (input: number | undefined) => {
      if (input === undefined) return "Please enter a number";
      const isValid = input >= 1 && input <= pending.length;
      if (!isValid) {
        return `Please enter a number between 1 and ${pending.length}`;
      }
      return true;
    },
  );
  prompt.close();

  const spin = spinner("Running migrations...").start();

  try {
    const count = await migrations.up(steps);
    spin.succeed(`Applied ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Migration failed");
    logger.error(error);
    throw error;
  }
}

export async function runToSpecificMigration(
  migrations: Migrations,
  pending: MigrationFile[],
): Promise<number> {
  const migrationChoices: PromptChoice[] = pending.map((m) => ({
    name: `${m.id}_${m.name}`,
    value: m.id,
  }));

  const prompt = new Prompt();
  const migrationId = await prompt.list(
    "Run migrations up to (inclusive):",
    migrationChoices,
  );
  prompt.close();

  const spin = spinner("Running migrations...").start();

  try {
    const count = await migrations.upTo(migrationId);
    spin.succeed(`Applied ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Migration failed");
    logger.error(error);
    throw error;
  }
}

export function showSuccessTable(count: number): void {
  const table = createTable(
    [colors.cyan("Status"), colors.cyan("Migrations")],
    [[colors.green("[x]"), `${count} migration(s) applied successfully`]],
  );
  console.log(table);
}
