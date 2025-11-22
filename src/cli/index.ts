import { Command } from "commander";
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
import inquirer from "inquirer";
import { PROMPTS, MESSAGES } from "./constants";

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

const program = new Command();

program
  .name("prisma-migrations")
  .description("Simple up/down migrations for Prisma")
  .version("0.1.3")
  .option("-v, --verbose", "Enable verbose logging")
  .option(
    "--log-level <level>",
    "Set log level (silent, error, warn, info, debug, trace)",
  );

program
  .command("init")
  .description("Initialize migrations directory")
  .action(async () => {
    try {
      await init();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("create [name]")
  .description("Create a new migration")
  .action(async (name) => {
    try {
      await create(name);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("setup-source")
  .description("Set up source package for type exports (monorepo)")
  .action(async () => {
    try {
      await setupSource({ cwd: process.cwd() });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("link-types <source-package>")
  .description("Link Prisma types from source package (monorepo)")
  .action(async (sourcePackage) => {
    try {
      await linkTypes(sourcePackage, { cwd: process.cwd() });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("validate")
  .description("Validate monorepo type setup")
  .option("--source", "Validate as source package")
  .option("--check <package>", "Check if consumer package has source linked")
  .action(async (options) => {
    try {
      await validate({ cwd: process.cwd(), ...options });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("up")
  .description("Run pending migrations")
  .option("-s, --steps <number>", "Number of migrations to run")
  .option("-i, --interactive", "Interactive mode")
  .option("--dry-run", "Show what migrations would run without executing them")
  .action(async (options, command) => {
    try {
      const parentOpts = command.parent.opts();
      const logLevel = parentOpts.verbose
        ? "debug"
        : parentOpts.logLevel || "silent";
      setLogLevel(logLevel);

      const config = await loadConfig();
      const prisma = await createPrismaClient();

      if (options.dryRun) {
        const migrations = new Migrations(prisma, config);
        const steps = options.steps ? parseInt(options.steps) : undefined;
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
        await prisma.$disconnect();
        return;
      }

      const steps = options.steps ? parseInt(options.steps) : undefined;
      const interactive = options.interactive || false;
      await up(prisma, steps, config, interactive);
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("down")
  .description("Rollback migrations")
  .option("-s, --steps <number>", "Number of migrations to rollback", "1")
  .option("-i, --interactive", "Interactive mode")
  .action(async (options, command) => {
    try {
      const parentOpts = command.parent.opts();
      const logLevel = parentOpts.verbose
        ? "debug"
        : parentOpts.logLevel || "silent";
      setLogLevel(logLevel);

      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const steps = parseInt(options.steps);
      const interactive = options.interactive || false;
      await down(prisma, steps, config, interactive);
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("status")
  .description("Show migration status")
  .action(async () => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);
      await migrations.status();
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("pending")
  .description("List pending migrations")
  .action(async () => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);
      const pending = await migrations.pending();

      if (pending.length === 0) {
        console.log(colors.green("No pending migrations"));
      } else {
        console.log(colors.cyan(`\n${pending.length} pending migration(s):\n`));
        pending.forEach((m: MigrationFile) =>
          console.log(`  ${m.id}_${m.name}`),
        );
      }
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("applied")
  .description("List applied migrations")
  .action(async () => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);
      const applied = await migrations.applied();

      if (applied.length === 0) {
        console.log(colors.yellow("No applied migrations"));
      } else {
        console.log(colors.cyan(`\n${applied.length} applied migration(s):\n`));
        applied.forEach((m: MigrationFile) =>
          console.log(`  ✓ ${m.id}_${m.name}`),
        );
      }
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("latest")
  .description("Show the latest applied migration")
  .action(async () => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);
      const latest = await migrations.latest();

      if (!latest) {
        console.log(colors.yellow("No migrations applied yet"));
      } else {
        console.log(colors.cyan("Latest migration:"));
        console.log(`  ✓ ${latest.id}_${latest.name}`);
      }
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("reset")
  .description("Rollback all migrations")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);
      const applied = await migrations.applied();

      if (applied.length === 0) {
        console.log(colors.yellow(MESSAGES.NO_MIGRATIONS_TO_ROLLBACK));
        await prisma.$disconnect();
        return;
      }

      const shouldProceed =
        options.force ||
        (
          await inquirer.prompt([
            {
              ...PROMPTS.RESET_CONFIRM,
              message: PROMPTS.RESET_CONFIRM.message(applied.length),
            },
          ])
        ).confirm;

      if (!shouldProceed) {
        console.log(colors.gray(MESSAGES.CANCELLED));
        await prisma.$disconnect();
        return;
      }

      const count = await migrations.reset();
      console.log(colors.green(`\n✓ Rolled back ${count} migration(s)`));
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("fresh")
  .description("Rollback all migrations and re-run them")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);

      const shouldProceed =
        options.force ||
        (await inquirer.prompt([PROMPTS.FRESH_CONFIRM])).confirm;

      if (!shouldProceed) {
        console.log(colors.gray(MESSAGES.CANCELLED));
        await prisma.$disconnect();
        return;
      }

      const count = await migrations.fresh();
      console.log(
        colors.green(
          `\n✓ Fresh migration complete. Applied ${count} migration(s)`,
        ),
      );
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("refresh")
  .description("Rollback all migrations and re-run them (alias for fresh)")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const prisma = await createPrismaClient();
      const migrations = new Migrations(prisma, config);

      const shouldProceed =
        options.force ||
        (await inquirer.prompt([PROMPTS.REFRESH_CONFIRM])).confirm;

      if (!shouldProceed) {
        console.log(colors.gray(MESSAGES.CANCELLED));
        await prisma.$disconnect();
        return;
      }

      const result = await migrations.refresh();
      console.log(
        colors.green(
          `\n✓ Refresh complete. Rolled back ${result.down}, applied ${result.up} migration(s)`,
        ),
      );
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("dev [name]")
  .description(
    "Create and apply a new Prisma schema migration (wraps prisma migrate dev)",
  )
  .action(async (name) => {
    try {
      await prisma.dev(name);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("deploy")
  .description(
    "Apply pending Prisma schema migrations (wraps prisma migrate deploy)",
  )
  .action(async () => {
    try {
      await prisma.deploy();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("resolve")
  .description("Resolve migration issues (wraps prisma migrate resolve)")
  .option("--applied <migration>", "Mark a migration as applied")
  .option("--rolled-back <migration>", "Mark a migration as rolled back")
  .action(async (options) => {
    try {
      await prisma.resolve({
        applied: options.applied,
        rolledBack: options.rolledBack,
      });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("push")
  .description("Push schema changes to database (wraps prisma db push)")
  .option("--skip-generate", "Skip generating Prisma Client")
  .action(async (options) => {
    try {
      await prisma.dbPush({ skipGenerate: options.skipGenerate });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("generate")
  .description("Generate Prisma Client (wraps prisma generate)")
  .action(async () => {
    try {
      await prisma.generate();
    } catch (error) {
      handleError(error);
    }
  });

program.parse();
