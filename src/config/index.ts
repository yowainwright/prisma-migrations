import { lilconfig } from "lilconfig";
import type { MigrationsConfig } from "../types";
import { validateConfig } from "./schema";

export async function loadConfig(): Promise<MigrationsConfig> {
  const explorer = lilconfig("prisma-migrations");
  const result = await explorer.search();
  const config = result?.config || {};
  return validateConfig(config) as MigrationsConfig;
}
