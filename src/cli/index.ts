import { Command } from "commander";
import { up } from "./commands/up";
import { down } from "./commands/down";
import { init } from "./commands/init";
import { create } from "./commands/create";
import { loadConfig } from "../config";
import { Migrations } from "../migrations";
import { Discovery } from "../discovery";
import { setLogLevel } from "../logger";
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
    }
  });

program
  .command("create [name]")
  .description("Create a new migration")
  .action(async (name) => {
    try {
      await create(name);
    } catch (error) {
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
        pending.forEach((m) => console.log(`  ${m.id}_${m.name}`));
      }
      await prisma.$disconnect();
    } catch (error) {
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
        applied.forEach((m) => console.log(`  ✓ ${m.id}_${m.name}`));
      }
      await prisma.$disconnect();
    } catch (error) {
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
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
      console.error(chalk.red("Error:"), error);
      process.exit(1);
    }
  });

program.parse();
