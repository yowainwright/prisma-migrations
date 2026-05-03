import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { Prompt } from "../../../utils/prompts";
import {
  generateMigrationId,
  validateMigrationName,
  spinner,
  colors,
} from "../../../utils";

export async function create(
  name?: string,
  config?: { migrationsDir?: string },
) {
  let migrationName = name;

  if (!migrationName) {
    const prompt = new Prompt();
    migrationName = await prompt.input(
      "Migration name:",
      undefined,
      (input: string) => {
        if (input.length === 0) return "Name is required";
        if (!validateMigrationName(input)) {
          return "Name must contain only lowercase letters, numbers, and underscores";
        }
        return true;
      },
    );
    prompt.close();
  } else if (!validateMigrationName(migrationName)) {
    throw new Error(
      "Migration name must contain only lowercase letters, numbers, and underscores",
    );
  }

  const spin = spinner("Creating migration...").start();

  try {
    const migrationsDir = resolve(
      process.cwd(),
      config?.migrationsDir || "prisma/migrations",
    );
    await mkdir(migrationsDir, { recursive: true });

    const timestamp = generateMigrationId();
    const migrationDir = resolve(
      migrationsDir,
      `${timestamp}_${migrationName}`,
    );

    await mkdir(migrationDir, { recursive: true });

    const migrationContent = `-- Migration: Up
-- Add your forward migration SQL here
-- This will be executed when running: prisma-migrations up


-- Migration: Down
-- Add your rollback migration SQL here
-- This will be executed when running: prisma-migrations down

`;

    await writeFile(resolve(migrationDir, "migration.sql"), migrationContent);

    spin.succeed("Migration created");

    console.log(colors.cyan(`\n${timestamp}_${migrationName}`));
    console.log(colors.gray(`Location: ${migrationDir}`));
  } catch (error) {
    spin.fail("Failed to create migration");
    throw error;
  }
}
