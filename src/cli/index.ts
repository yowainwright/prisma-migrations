import { up } from "./commands/up";
import { down } from "./commands/down";
import { init } from "./commands/init";
import { create } from "./commands/create";
import * as prisma from "./commands/prisma";
import { setupSource } from "./commands/setup/source";
import { linkTypes } from "./commands/setup/link-types";
import { validate } from "./commands/setup/validate";
import { loadConfig } from "../config";
import { Migrations } from "../migrations";
import { createPrismaClient } from "./client-factory";
import { setLogLevel, logger } from "../logger";
import type { MigrationFile } from "../types";
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

  const logLevel = parsed.options.verbose
    ? "debug"
    : (parsed.options.logLevel as string) || "silent";
  setLogLevel(logLevel);

  try {
    switch (parsed.command) {
      case "init":
        await init();
        break;

      case "create":
        await create(parsed.args[0]);
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
        const config = await loadConfig();
        const client = await createPrismaClient();

        if (parsed.options.dryRun) {
          const migrations = new Migrations(client, config);
          const steps = parsed.options.steps
            ? parseInt(parsed.options.steps as string)
            : undefined;
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
          await client.$disconnect();
          return;
        }

        const steps = parsed.options.steps
          ? parseInt(parsed.options.steps as string)
          : undefined;
        const interactive = parsed.options.interactive as boolean;
        await up(client, steps, config, interactive);
        await client.$disconnect();
        break;
      }

      case "down": {
        const config = await loadConfig();
        const client = await createPrismaClient();
        const steps = parsed.options.steps
          ? parseInt(parsed.options.steps as string)
          : 1;
        const interactive = parsed.options.interactive as boolean;
        await down(client, steps, config, interactive);
        await client.$disconnect();
        break;
      }

      case "status": {
        const config = await loadConfig();
        const client = await createPrismaClient();
        const migrations = new Migrations(client, config);
        await migrations.status();
        await client.$disconnect();
        break;
      }

      case "pending": {
        const config = await loadConfig();
        const client = await createPrismaClient();
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
        await client.$disconnect();
        break;
      }

      case "applied": {
        const config = await loadConfig();
        const client = await createPrismaClient();
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
        await client.$disconnect();
        break;
      }

      case "latest": {
        const config = await loadConfig();
        const client = await createPrismaClient();
        const migrations = new Migrations(client, config);
        const latest = await migrations.latest();

        if (!latest) {
          console.log(colors.yellow("No migrations applied yet"));
        } else {
          console.log(colors.cyan("Latest migration:"));
          console.log(`  ✓ ${latest.id}_${latest.name}`);
        }
        await client.$disconnect();
        break;
      }

      case "reset": {
        const config = await loadConfig();
        const client = await createPrismaClient();
        const migrations = new Migrations(client, config);
        const applied = await migrations.applied();

        if (applied.length === 0) {
          console.log(colors.yellow(MESSAGES.NO_MIGRATIONS_TO_ROLLBACK));
          await client.$disconnect();
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
          await client.$disconnect();
          return;
        }

        const count = await migrations.reset();
        console.log(colors.green(`\n✓ Rolled back ${count} migration(s)`));
        await client.$disconnect();
        break;
      }

      case "fresh": {
        const config = await loadConfig();
        const client = await createPrismaClient();
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
          await client.$disconnect();
          return;
        }

        const count = await migrations.fresh();
        console.log(
          colors.green(
            `\n✓ Fresh migration complete. Applied ${count} migration(s)`,
          ),
        );
        await client.$disconnect();
        break;
      }

      case "refresh": {
        const config = await loadConfig();
        const client = await createPrismaClient();
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
          await client.$disconnect();
          return;
        }

        const result = await migrations.refresh();
        console.log(
          colors.green(
            `\n✓ Refresh complete. Rolled back ${result.down}, applied ${result.up} migration(s)`,
          ),
        );
        await client.$disconnect();
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

      default:
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    handleError(error);
  }
}

main();
