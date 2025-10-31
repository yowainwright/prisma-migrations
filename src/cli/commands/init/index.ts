import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import chalk from "chalk";
import { generateMigrationId } from "../../../utils";

export async function init() {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  await mkdir(migrationsDir, { recursive: true });

  const timestamp = generateMigrationId();
  const migrationName = "initial_migration";
  const migrationDir = join(migrationsDir, `${timestamp}_${migrationName}`);

  await mkdir(migrationDir, { recursive: true });

  const migrationContent = `-- Add your migration SQL here
-- This will be executed when running: prisma-migrations up

-- Example:
-- CREATE TABLE users (
--   id SERIAL PRIMARY KEY,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );
`;

  await writeFile(join(migrationDir, "migration.sql"), migrationContent);

  console.log(
    chalk.green(`\n✓ Created migration: ${timestamp}_${migrationName}`),
  );
  console.log(chalk.gray(`  Location: ${migrationDir}`));
  console.log(chalk.gray(`  File: migration.sql`));
}
