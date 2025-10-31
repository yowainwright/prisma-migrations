import { Command } from "commander";
import { up } from "./commands/up";
import { down } from "./commands/down";
import { init } from "./commands/init";
import { create } from "./commands/create";
import { mcp } from "./commands/mcp";
import * as prisma from "./commands/prisma";
import { loadConfig } from "../config";
import { Migrations } from "../migrations";
import { Discovery } from "../discovery";
import { setLogLevel } from "../logger";
import type { MigrationFile } from "../types";
import { MigrationError } from "../errors";
import boxen from "boxen";
import chalk from "chalk";

console.log(
  boxen(chalk.cyan.bold("Prisma Migrations"), {
    padding: 1,
    margin: 1,
    borderStyle: "round",
    borderColor: "cyan",
  }),
);

function handleError(error: unknown) {
  if (error instanceof MigrationError) {
    console.error(error.format());
  } else if (error instanceof Error) {
    console.error(chalk.red("❌"), chalk.red.bold("Error:"), error.message);
  } else {
    console.error(chalk.red("❌"), chalk.red.bold("Error:"), String(error));
  }
  process.exit(1);
}

const program = new Command();

program
  .name("prisma-migrations")
  .description("Simple up/down migrations for Prisma")
  .version("1.0.0")
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
  .command("up")
  .description("Run pending migrations")
  .option("-s, --steps <number>", "Number of migrations to run")
  .option("-i, --interactive", "Interactive mode")
  .action(async (options, command) => {
    const discovery = new Discovery();
    try {
      const parentOpts = command.parent.opts();
      const logLevel = parentOpts.verbose
        ? "debug"
        : parentOpts.logLevel || "silent";
      setLogLevel(logLevel);

      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
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
    const discovery = new Discovery();
    try {
      const parentOpts = command.parent.opts();
      const logLevel = parentOpts.verbose
        ? "debug"
        : parentOpts.logLevel || "silent";
      setLogLevel(logLevel);

      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
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
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
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
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
      const migrations = new Migrations(prisma, config);
      const pending = await migrations.pending();

      if (pending.length === 0) {
        console.log(chalk.green("No pending migrations"));
      } else {
        console.log(chalk.cyan(`\n${pending.length} pending migration(s):\n`));
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
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
      const migrations = new Migrations(prisma, config);
      const applied = await migrations.applied();

      if (applied.length === 0) {
        console.log(chalk.yellow("No applied migrations"));
      } else {
        console.log(chalk.cyan(`\n${applied.length} applied migration(s):\n`));
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
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
      const migrations = new Migrations(prisma, config);
      const latest = await migrations.latest();

      if (!latest) {
        console.log(chalk.yellow("No migrations applied yet"));
      } else {
        console.log(chalk.cyan("Latest migration:"));
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
  .action(async () => {
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
      const migrations = new Migrations(prisma, config);
      const count = await migrations.reset();
      console.log(chalk.green(`\n✓ Rolled back ${count} migration(s)`));
      await prisma.$disconnect();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("fresh")
  .description("Rollback all migrations and re-run them")
  .action(async () => {
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
      const migrations = new Migrations(prisma, config);
      const count = await migrations.fresh();
      console.log(
        chalk.green(
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
  .action(async () => {
    const discovery = new Discovery();
    try {
      const config = await loadConfig();
      const prisma = await discovery.findPrismaClient(config);
      const migrations = new Migrations(prisma, config);
      const result = await migrations.refresh();
      console.log(
        chalk.green(
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

program
  .command("mcp")
  .description(
    "Start MCP server for AI assistant integration (data migrations + Prisma)",
  )
  .action(async () => {
    try {
      await mcp();
    } catch (error) {
      handleError(error);
    }
  });

program.parse();
