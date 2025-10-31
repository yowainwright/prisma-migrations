import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import boxen from "boxen";
import { generateMigrationId, validateMigrationName } from "../../../utils";

export async function create(name?: string) {
  let migrationName = name;

  if (!migrationName) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Migration name:",
        validate: (input: string) => {
          if (input.length === 0) return "Name is required";
          if (!validateMigrationName(input)) {
            return "Name must contain only lowercase letters, numbers, and underscores";
          }
          return true;
        },
      },
    ]);
    migrationName = answers.name;
  } else if (!validateMigrationName(migrationName)) {
    throw new Error(
      "Migration name must contain only lowercase letters, numbers, and underscores",
    );
  }

  const spinner = ora("Creating migration...").start();

  try {
    const migrationsDir = join(process.cwd(), "prisma", "migrations");
    await mkdir(migrationsDir, { recursive: true });

    const timestamp = generateMigrationId();
    const migrationDir = join(migrationsDir, `${timestamp}_${migrationName}`);

    await mkdir(migrationDir, { recursive: true });

    const migrationContent = `-- Add your migration SQL here
-- This will be executed when running: prisma-migrations up

-- Example:
-- ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
`;

    await writeFile(join(migrationDir, "migration.sql"), migrationContent);

    spinner.succeed(chalk.green("Migration created"));

    console.log(
      boxen(
        chalk.cyan(`${timestamp}_${migrationName}\n`) +
          chalk.gray(`Location: ${migrationDir}`),
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "green",
        },
      ),
    );
  } catch (error) {
    spinner.fail(chalk.red("Failed to create migration"));
    throw error;
  }
}
