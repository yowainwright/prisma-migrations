import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { generateMigrationId, colors } from "../../../utils";

export async function init(config?: { migrationsDir?: string }) {
  const migrationsDir = resolve(
    process.cwd(),
    config?.migrationsDir || "prisma/migrations",
  );
  await mkdir(migrationsDir, { recursive: true });

  const timestamp = generateMigrationId();
  const migrationName = "initial_migration";
  const migrationDir = resolve(migrationsDir, `${timestamp}_${migrationName}`);

  await mkdir(migrationDir, { recursive: true });

  const migrationContent = `-- Add your forward migration SQL here
-- This will be executed when running: prisma-migrations up
-- Example:
-- CREATE TABLE users (
--   id SERIAL PRIMARY KEY,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );


`;
  const rollbackContent = `-- Add your rollback migration SQL here
-- This will be executed when running: prisma-migrations down
-- Example:
-- DROP TABLE IF EXISTS users;

`;

  await writeFile(resolve(migrationDir, "migration.sql"), migrationContent);
  await writeFile(resolve(migrationDir, "down.sql"), rollbackContent);

  console.log(
    colors.green(`\n✓ Created migration: ${timestamp}_${migrationName}`),
  );
  console.log(colors.gray(`  Location: ${migrationDir}`));
  console.log(colors.gray(`  Files: migration.sql, down.sql`));
}
