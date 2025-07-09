import { MigrationConfig } from "../src/types";

const config: MigrationConfig = {
  migrationsDir: "./e2e",
  schemaPath: "./prisma/schema.prisma",
  tableName: "_prisma_migrations",
  createTable: true,
  migrationFormat: "ts",
  extension: ".ts",
};

export default config;
