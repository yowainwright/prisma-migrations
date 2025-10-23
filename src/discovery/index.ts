import fastGlob from "fast-glob";
import type { PrismaClient, MigrationsConfig } from "../types";
import { logger } from "../logger";

export class Discovery {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  async findPrismaClient(config?: MigrationsConfig): Promise<PrismaClient> {
    const hasClient = config?.prismaClient !== undefined;
    if (hasClient) {
      return config.prismaClient;
    }

    const clientPaths = await fastGlob(
      "**/node_modules/@prisma/client/index.js",
      {
        cwd: this.cwd,
        absolute: true,
        ignore: ["**/node_modules/**/node_modules/**"],
      },
    );

    const hasClientPath = clientPaths.length > 0;
    if (!hasClientPath) {
      throw new Error(
        'Could not find @prisma/client. Please run "prisma generate" first.',
      );
    }

    const { PrismaClient } = await import(clientPaths[0]);
    return new PrismaClient();
  }

  async findMigrationsDir(config?: MigrationsConfig): Promise<string> {
    const hasDir = config?.migrationsDir !== undefined;
    if (hasDir) {
      return config.migrationsDir;
    }

    const prismaDirs = await fastGlob("**/prisma", {
      cwd: this.cwd,
      absolute: true,
      onlyDirectories: true,
      ignore: ["**/node_modules/**"],
    });

    const hasPrismaDir = prismaDirs.length > 0;
    if (hasPrismaDir) {
      return `${prismaDirs[0]}/migrations`;
    }

    return "./prisma/migrations";
  }
}
