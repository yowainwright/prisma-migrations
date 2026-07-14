import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { validateConfig } from "./schema";
import type { MigrationsConfig } from "./schema";

export type { LogLevel, MigrationsConfig, PrismaClientFactory } from "./schema";

const CONFIG_FILES = [
  ".prisma-migrationsrc.json",
  ".prisma-migrationsrc.js",
  "prisma-migrations.config.js",
  "package.json",
];

type ConfigResult = Promise<unknown | null>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function readJsonConfig(filePath: string, fileName: string) {
  const content = await readFile(filePath, "utf-8");
  const parsed: unknown = JSON.parse(content);
  const isPackage = fileName === "package.json";
  if (!isPackage) return parsed;
  const isObject = typeof parsed === "object" && parsed !== null;
  if (!isObject) return null;
  const packageJson = parsed as Record<string, unknown>;
  return packageJson["prisma-migrations"] ?? null;
}

async function readJavaScriptConfig(filePath: string) {
  const url = pathToFileURL(filePath).href;
  const module = await import(url);
  return module.default ?? module;
}

async function readConfigFile(filePath: string, fileName: string) {
  const isJson = fileName.endsWith(".json");
  if (isJson) return readJsonConfig(filePath, fileName);
  return readJavaScriptConfig(filePath);
}

async function searchConfig(cwd: string): ConfigResult {
  const found = CONFIG_FILES.find((fileName) => {
    return existsSync(join(cwd, fileName));
  });
  if (!found) return null;
  const filePath = join(cwd, found);
  try {
    return await readConfigFile(filePath, found);
  } catch (error) {
    const reason = toErrorMessage(error);
    throw new Error(`Failed to load configuration from ${filePath}: ${reason}`);
  }
}

export async function loadConfig(
  cwd = process.cwd(),
): Promise<MigrationsConfig> {
  const config = (await searchConfig(cwd)) ?? {};
  return validateConfig(config);
}
