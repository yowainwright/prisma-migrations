import { up } from "./commands/up";
import { down } from "./commands/down";
import { init } from "./commands/init";
import { create } from "./commands/create";
import * as prisma from "./commands/prisma";
import { setupSource } from "./commands/setup/source";
import { linkTypes } from "./commands/setup/link-types";
import { validate } from "./commands/setup/validate";
import { checkLock, releaseLock } from "./commands/lock";
import { loadConfig } from "../config";
import { Migrations } from "../migrations";
import { createPrismaClient } from "./client-factory";
import { setLogLevel, logger } from "../logger";
import type { MigrationFile, PrismaClient } from "../types";
import { MigrationError } from "../errors";
import { colors } from "../utils/colors";
import { Prompt } from "../utils/prompts";
import { PROMPTS, MESSAGES } from "./constants";
import { parseArgs, showHelp, showVersion } from "./parser";

console.log(
  `\n   ╭───────────────────────╮\n   │                       │\n   │   ${colors.bold(colors.cyan("Prisma Migrations"))}   │\n   │                       │\n   ╰───────────────────────╯\n`,
);

function handleError(error: unknown) {
  if (error instanceof MigrationError) {
    logger.error(error.format());
  } else if (error instanceof Error) {
    logger.error(error.message);
  } else {
    logger.error(String(error));
  }
  process.exit(1);
}

function parseStepsOption(value: unknown, defaultValue?: number) {
  if (value === undefined) return defaultValue;

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("--steps must be a positive integer");
  }

  const steps = Number(value);
  if (!Number.isSafeInteger(steps) || steps < 1) {
    throw new Error("--steps must be a positive integer");
  }

  return steps;
}

async function withPrismaClient<T>(
  fn: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = await createPrismaClient();

  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const parsed = parseArgs(process.argv);

  if (parsed.options.help) {
    showHelp();
    process.exit(0);
  }

  if (parsed.options.version) {
    showVersion();
    process.exit(0);
  }

  try {
    const logLevel = parsed.options.verbose
      ? "debug"
      : (parsed.options.logLevel as string) || "silent";
    setLogLevel(logLevel);

    const loadRuntimeConfig = async () => {
      const config = await loadConfig();
      if (
        !parsed.options.verbose &&
        !parsed.options.logLevel &&
        config.logLevel
      ) {
        setLogLevel(config.logLevel);
      }
      return config;
    };

    switch (parsed.command) {
      case "init":
        await init(await loadRuntimeConfig());
        break;

      case "create":
        await create(parsed.args[0], await loadRuntimeConfig());
        break;

      case "setup-source":
        await setupSource({ cwd: process.cwd() });
        break;

      case "link-types": {
        const sourcePackage = parsed.args[0];
        if (!sourcePackage) {
          throw new Error("source-package argument is required");
        }
        await linkTypes(sourcePackage, { cwd: process.cwd() });
        break;
      }

      case "validate":
        await validate({
          cwd: process.cwd(),
          source: parsed.options.source as boolean,
          check: parsed.options.check as string,
        });
        break;

      case "up": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          if (parsed.options.dryRun) {
            const migrations = new Migrations(client, config);
            const steps = parseStepsOption(parsed.options.steps);
            const toRun = await migrations.dryRun(steps);

            if (toRun.length === 0) {
              console.log(colors.green("No pending migrations"));
            } else {
              console.log(
                colors.cyan(`\nWould run ${toRun.length} migration(s):\n`),
              );
              toRun.forEach((m: MigrationFile) =>
                console.log(`  ${m.id}_${m.name}`),
              );
            }
            return;
          }

          const steps = parseStepsOption(parsed.options.steps);
          const interactive = parsed.options.interactive as boolean;
          await up(client, steps, config, interactive);
        });
        break;
      }

      case "down": {
        const config = await loadRuntimeConfig();
        const steps = parseStepsOption(parsed.options.steps, 1);
        const interactive = parsed.options.interactive as boolean;
        await withPrismaClient((client) =>
          down(client, steps, config, interactive),
        );
        break;
      }

      case "status": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);
          await migrations.status();
        });
        break;
      }

      case "pending": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);
          const pending = await migrations.pending();

          if (pending.length === 0) {
            console.log(colors.green("No pending migrations"));
          } else {
            console.log(
              colors.cyan(`\n${pending.length} pending migration(s):\n`),
            );
            pending.forEach((m: MigrationFile) =>
              console.log(`  ${m.id}_${m.name}`),
            );
          }
        });
        break;
      }

      case "applied": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);
          const applied = await migrations.applied();

          if (applied.length === 0) {
            console.log(colors.yellow("No applied migrations"));
          } else {
            console.log(
              colors.cyan(`\n${applied.length} applied migration(s):\n`),
            );
            applied.forEach((m: MigrationFile) =>
              console.log(`  ✓ ${m.id}_${m.name}`),
            );
          }
        });
        break;
      }

      case "latest": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);
          const latest = await migrations.latest();

          if (!latest) {
            console.log(colors.yellow("No migrations applied yet"));
          } else {
            console.log(colors.cyan("Latest migration:"));
            console.log(`  ✓ ${latest.id}_${latest.name}`);
          }
        });
        break;
      }

      case "reset": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);
          const applied = await migrations.applied();

          if (applied.length === 0) {
            console.log(colors.yellow(MESSAGES.NO_MIGRATIONS_TO_ROLLBACK));
            return;
          }

          const shouldProceed =
            parsed.options.force ||
            (await (async () => {
              const prompt = new Prompt();
              const result = await prompt.confirm(
                PROMPTS.RESET_CONFIRM.message(applied.length),
                false,
              );
              prompt.close();
              return result;
            })());

          if (!shouldProceed) {
            console.log(colors.gray(MESSAGES.CANCELLED));
            return;
          }

          const count = await migrations.reset();
          console.log(colors.green(`\n✓ Rolled back ${count} migration(s)`));
        });
        break;
      }

      case "fresh": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);

          const shouldProceed =
            parsed.options.force ||
            (await (async () => {
              const prompt = new Prompt();
              const result = await prompt.confirm(
                PROMPTS.FRESH_CONFIRM.message,
                false,
              );
              prompt.close();
              return result;
            })());

          if (!shouldProceed) {
            console.log(colors.gray(MESSAGES.CANCELLED));
            return;
          }

          const count = await migrations.fresh();
          console.log(
            colors.green(
              `\n✓ Fresh migration complete. Applied ${count} migration(s)`,
            ),
          );
        });
        break;
      }

      case "refresh": {
        const config = await loadRuntimeConfig();
        await withPrismaClient(async (client) => {
          const migrations = new Migrations(client, config);

          const shouldProceed =
            parsed.options.force ||
            (await (async () => {
              const prompt = new Prompt();
              const result = await prompt.confirm(
                PROMPTS.REFRESH_CONFIRM.message,
                false,
              );
              prompt.close();
              return result;
            })());

          if (!shouldProceed) {
            console.log(colors.gray(MESSAGES.CANCELLED));
            return;
          }

          const result = await migrations.refresh();
          console.log(
            colors.green(
              `\n✓ Refresh complete. Rolled back ${result.down}, applied ${result.up} migration(s)`,
            ),
          );
        });
        break;
      }

      case "dev":
        await prisma.dev(parsed.args[0]);
        break;

      case "deploy":
        await prisma.deploy();
        break;

      case "resolve":
        await prisma.resolve({
          applied: parsed.options.applied as string,
          rolledBack: parsed.options.rolledBack as string,
        });
        break;

      case "push":
        await prisma.dbPush({
          skipGenerate: parsed.options.skipGenerate as boolean,
        });
        break;

      case "generate":
        await prisma.generate();
        break;

      case "lock": {
        const subcommand = parsed.args[0];
        const exitCode = await withPrismaClient(async (client) => {
          const isCheckCommand = subcommand === "check";
          const isReleaseCommand = subcommand === "release";

          if (isCheckCommand) {
            return await checkLock(client);
          }

          if (isReleaseCommand) {
            const force = parsed.options.force as boolean;
            return await releaseLock(client, force);
          }

          logger.error(`Unknown lock subcommand: ${subcommand}`);
          logger.info("Available subcommands: check, release");
          return 1;
        });

        process.exit(exitCode);
      }

      default:
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    handleError(error);
  }
}

main();
