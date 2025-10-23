import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import boxen from "boxen";

export async function create(name?: string) {
  let migrationName = name;

  if (!migrationName) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Migration name:",
        validate: (input: string) => input.length > 0 || "Name is required",
      },
    ]);
    migrationName = answers.name;
  }

  const spinner = ora("Creating migration...").start();

  try {
    const migrationsDir = join(process.cwd(), "prisma", "migrations");
    await mkdir(migrationsDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0]
      .replace("T", "");
    const migrationDir = join(migrationsDir, `${timestamp}_${migrationName}`);

    await mkdir(migrationDir, { recursive: true });

    const migrationContent = `import type { PrismaClient } from 'prisma-migrations';

export async function up(prisma: PrismaClient) {
  // Add your up migration here
}

export async function down(prisma: PrismaClient) {
  // Add your down migration here
}
`;

    await writeFile(join(migrationDir, "migration.ts"), migrationContent);

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
