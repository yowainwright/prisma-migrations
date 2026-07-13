import { createRequire } from "module";
import type { PrismaClientFactory } from "../config";
import type { PrismaClient } from "../types";

interface PrismaPackageJson {
  version: string;
}

interface PrismaClientModule {
  PrismaClient: new () => PrismaClient;
}

function getPrismaMajorVersion(): number {
  const require = createRequire(import.meta.url);
  const packageJson =
    require("@prisma/client/package.json") as PrismaPackageJson;
  const major = Number.parseInt(packageJson.version.split(".")[0], 10);
  if (Number.isSafeInteger(major)) return major;
  throw new Error(`Invalid @prisma/client version: ${packageJson.version}`);
}

function assertDefaultClientSupported(majorVersion: number): void {
  if (majorVersion < 7) return;
  throw new Error(
    "Prisma 7 requires a generated client factory for CLI commands. " +
      "Set clientFactory in prisma-migrations.config.js.",
  );
}

export async function createPrismaClient(
  factory?: PrismaClientFactory,
): Promise<PrismaClient> {
  if (factory) return factory();
  const majorVersion = getPrismaMajorVersion();
  assertDefaultClientSupported(majorVersion);
  const clientModule =
    (await import("@prisma/client")) as unknown as PrismaClientModule;
  return new clientModule.PrismaClient();
}
