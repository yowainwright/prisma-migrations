import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import pc from "picocolors";
import { generateMigrationId } from "../../../utils";

export async function init() {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  await mkdir(migrationsDir, { recursive: true });

  const timestamp = generateMigrationId();
  const migrationName = "initial_migration";
  const migrationDir = join(migrationsDir, `${timestamp}_${migrationName}`);

  await mkdir(migrationDir, { recursive: true });

  const migrationContent = `-- Migration: Up
-- Add your forward migration SQL here
-- This will be executed when running: prisma-migrations up
-- Example:
-- CREATE TABLE users (
--   id SERIAL PRIMARY KEY,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );


-- Migration: Down
-- Add your rollback migration SQL here
-- This will be executed when running: prisma-migrations down
-- Example:
-- DROP TABLE IF EXISTS users;

`;

  await writeFile(join(migrationDir, "migration.sql"), migrationContent);

  console.log(
    pc.green(`\n✓ Created migration: ${timestamp}_${migrationName}`),
  );
  console.log(pc.gray(`  Location: ${migrationDir}`));
  console.log(pc.gray(`  File: migration.sql`));
}
