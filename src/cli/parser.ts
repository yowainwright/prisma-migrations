import { readFileSync } from "fs";
import { join } from "path";

interface ParsedArgs {
  command?: string;
  args: string[];
  options: Record<string, unknown>;
}

function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version;
  } catch {
    return "unknown";
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const options: Record<string, unknown> = {};
  const positionalArgs: string[] = [];
  let command: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      i++;
      continue;
    }

    if (arg === "--version") {
      options.version = true;
      i++;
      continue;
    }

    if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
      i++;
      continue;
    }

    if (arg === "--log-level") {
      options.logLevel = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      i++;
      continue;
    }

    if (arg === "--interactive" || arg === "-i") {
      options.interactive = true;
      i++;
      continue;
    }

    if (arg === "--steps" || arg === "-s") {
      options.steps = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === "--force" || arg === "-f") {
      options.force = true;
      i++;
      continue;
    }

    if (arg === "--source") {
      options.source = true;
      i++;
      continue;
    }

    if (arg === "--check") {
      options.check = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === "--skip-generate") {
      options.skipGenerate = true;
      i++;
      continue;
    }

    if (arg === "--applied") {
      options.applied = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === "--rolled-back") {
      options.rolledBack = args[i + 1];
      i += 2;
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        options[key] = nextArg;
        i += 2;
      } else {
        options[key] = true;
        i++;
      }
      continue;
    }

    if (arg.startsWith("-") && arg.length > 2) {
      for (const char of arg.slice(1)) {
        if (char === "v") options.verbose = true;
        if (char === "i") options.interactive = true;
        if (char === "f") options.force = true;
      }
      i++;
      continue;
    }

    if (!command) {
      command = arg;
    } else {
      positionalArgs.push(arg);
    }
    i++;
  }

  return { command, args: positionalArgs, options };
}

const HELP_TEXT = `
   ╭───────────────────────╮
   │                       │
   │   Prisma Migrations   │
   │                       │
   ╰───────────────────────╯

Simple up/down migrations for Prisma

USAGE:
  prisma-migrations <command> [options]

COMMANDS:
  init                          Initialize migrations directory
  create [name]                 Create a new migration
  up                            Run pending migrations
  down                          Rollback migrations
  status                        Show migration status
  pending                       List pending migrations
  applied                       List applied migrations
  latest                        Show the latest applied migration
  reset                         Rollback all migrations
  fresh                         Rollback all migrations and re-run them
  refresh                       Rollback all migrations and re-run them (alias for fresh)

  Monorepo Commands:
  setup-source                  Set up source package for type exports
  link-types <source-package>   Link Prisma types from source package
  validate                      Validate monorepo type setup

  Prisma Wrapper Commands:
  dev [name]                    Create and apply a new Prisma schema migration
  deploy                        Apply pending Prisma schema migrations
  resolve                       Resolve migration issues
  push                          Push schema changes to database
  generate                      Generate Prisma Client

  Lock Management:
  lock check                    Check if migration lock is held
  lock release                  Release migration lock (use with caution)

GLOBAL OPTIONS:
  -v, --verbose                 Enable verbose logging
  --log-level <level>           Set log level (silent, error, warn, info, debug, trace)
  -h, --help                    Display help information

COMMAND OPTIONS:
  up:
    -s, --steps <number>        Number of migrations to run
    -i, --interactive           Interactive mode
    --dry-run                   Show what migrations would run without executing

  down:
    -s, --steps <number>        Number of migrations to rollback (default: 1)
    -i, --interactive           Interactive mode

  reset, fresh, refresh:
    -f, --force                 Skip confirmation prompt

  validate:
    --source                    Validate as source package
    --check <package>           Check if consumer package has source linked

  push:
    --skip-generate             Skip generating Prisma Client

  resolve:
    --applied <migration>       Mark a migration as applied
    --rolled-back <migration>   Mark a migration as rolled back

EXAMPLES:
  prisma-migrations init
  prisma-migrations create add_users_table
  prisma-migrations up
  prisma-migrations up --steps 2
  prisma-migrations up --interactive
  prisma-migrations down
  prisma-migrations down --steps 3
  prisma-migrations reset --force
  prisma-migrations status
`;

function showHelp(): void {
  console.log(HELP_TEXT);
}

function showVersion(): void {
  console.log(getVersion());
}

export { parseArgs, showHelp, showVersion };
export type { ParsedArgs };
