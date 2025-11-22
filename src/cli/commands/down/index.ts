import type { PrismaClient, MigrationFile } from "../../../types";
import { Migrations } from "../../../migrations";
import { logger } from "../../../logger";
import { Prompt, type PromptChoice } from "../../../utils/prompts";
import { spinner, createTable, colors } from "../../../utils";

export async function down(
  prisma: PrismaClient,
  steps: number = 1,
  config?: { migrationsDir?: string },
  interactive?: boolean,
) {
  const migrations = new Migrations(prisma, config);

  if (interactive) {
    return await interactiveDown(migrations);
  }

  const spin = spinner("Rolling back migrations...").start();

  try {
    const count = await migrations.down(steps);
    spin.succeed(`Rolled back ${count} migration(s)`);

    const hasRolledBack = count > 0;
    if (hasRolledBack) {
      showRollbackTable(count);
    }

    return count;
  } catch (error) {
    spin.fail("Rollback failed");
    logger.error(error);
    throw error;
  }
}

export async function interactiveDown(migrations: Migrations) {
  const applied = await migrations.applied();
  const hasApplied = applied.length > 0;

  if (!hasApplied) {
    console.log(colors.yellow("No applied migrations to rollback"));
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
  const choices: PromptChoice[] = [
    { name: colors.cyan("Last migration only"), value: "one" },
    { name: colors.yellow("Select number of migrations"), value: "steps" },
    {
      name: colors.blue("Select specific migration to rollback to"),
      value: "specific",
    },
    { name: colors.red("All migrations (reset)"), value: "all" },
  ];

  const prompt = new Prompt();
  const mode = await prompt.list(
    "How many migrations do you want to rollback?",
    choices,
  );
  prompt.close();

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
  const spin = spinner("Rolling back migration...").start();

  try {
    const count = await migrations.down(1);
    spin.succeed(`Rolled back ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Rollback failed");
    logger.error(error);
    throw error;
  }
}

export async function rollbackAll(migrations: Migrations): Promise<number> {
  const prompt = new Prompt();
  const confirm = await prompt.confirm(
    colors.red("Are you sure you want to rollback ALL migrations?"),
    false,
  );
  prompt.close();

  const isConfirmed = confirm === true;
  if (!isConfirmed) {
    console.log(colors.yellow("Cancelled"));
    return 0;
  }

  const spin = spinner("Rolling back all migrations...").start();

  try {
    const count = await migrations.reset();
    spin.succeed(`Rolled back ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Rollback failed");
    logger.error(error);
    throw error;
  }
}

export async function rollbackSteps(
  migrations: Migrations,
  applied: MigrationFile[],
): Promise<number> {
  const prompt = new Prompt();
  const steps = await prompt.number(
    `How many migrations? (1-${applied.length})`,
    1,
    (input: number | undefined) => {
      if (input === undefined) return "Please enter a number";
      const isValid = input >= 1 && input <= applied.length;
      if (!isValid) {
        return `Please enter a number between 1 and ${applied.length}`;
      }
      return true;
    },
  );
  prompt.close();

  const spin = spinner("Rolling back migrations...").start();

  try {
    const count = await migrations.down(steps);
    spin.succeed(`Rolled back ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Rollback failed");
    logger.error(error);
    throw error;
  }
}

export async function rollbackToSpecific(
  migrations: Migrations,
  applied: MigrationFile[],
): Promise<number> {
  const migrationChoices: PromptChoice[] = applied.map((m) => ({
    name: `${m.id}_${m.name}`,
    value: m.id,
  }));

  const prompt = new Prompt();
  const migrationId = await prompt.list(
    "Rollback down to (this migration will remain applied):",
    migrationChoices,
  );
  prompt.close();

  const spin = spinner("Rolling back migrations...").start();

  try {
    const count = await migrations.downTo(migrationId);
    spin.succeed(`Rolled back ${count} migration(s)`);
    return count;
  } catch (error) {
    spin.fail("Rollback failed");
    logger.error(error);
    throw error;
  }
}

export function showRollbackTable(count: number): void {
  const table = createTable(
    [colors.cyan("Status"), colors.cyan("Migrations")],
    [[colors.yellow("[ ]"), `${count} migration(s) rolled back`]],
  );
  console.log(table);
}
