import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import type { MigrationsConfig } from "../types";
import { validateConfig } from "./schema";

async function searchConfig(): Promise<Record<string, unknown> | null> {
  const cwd = process.cwd();
  const configFiles = [
    ".prisma-migrationsrc.json",
    ".prisma-migrationsrc.js",
    "prisma-migrations.config.js",
    "package.json",
  ];

  for (const file of configFiles) {
    const filePath = join(cwd, file);
    if (!existsSync(filePath)) continue;

    try {
      if (file.endsWith(".json")) {
        const content = await readFile(filePath, "utf-8");
        const json = JSON.parse(content);
        if (file === "package.json") {
          return json["prisma-migrations"] || null;
        }
        return json;
      }

      if (file.endsWith(".js")) {
        const mod = await import(filePath);
        return mod.default || mod;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function loadConfig(): Promise<MigrationsConfig> {
  const config = (await searchConfig()) || {};
  return validateConfig(config) as MigrationsConfig;
}
