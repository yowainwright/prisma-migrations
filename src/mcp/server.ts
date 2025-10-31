import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Migrations } from "../migrations/index.js";
import { Discovery } from "../discovery/index.js";
import { loadConfig } from "../config/index.js";
import type { MigrationFile } from "../types.js";
import { validateMigrationName } from "../utils/index.js";
import { validatePrismaCommand } from "./validation.js";
import { WARNING_MESSAGES } from "./constants.js";
import { spawn } from "child_process";

const server = new Server(
  {
    name: "prisma-migrations-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

async function execPrismaCommand(
  command: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; code: number }> {
  validatePrismaCommand(command, args);

  return new Promise((resolve, reject) => {
    const prisma = spawn("npx", ["prisma", command, ...args], {
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    prisma.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    prisma.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    prisma.on("close", (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });

    prisma.on("error", (error) => {
      reject(error);
    });
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "migration_status",
        description:
          "Show the status of all data migrations (pending and applied)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "migration_pending",
        description:
          "List all pending data migrations that haven't been run yet",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "migration_applied",
        description: "List all data migrations that have been applied",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "migration_up",
        description:
          "Run pending data migrations. Optionally specify number of migrations to run.",
        inputSchema: {
          type: "object",
          properties: {
            steps: {
              type: "number",
              description: "Number of migrations to run (optional)",
            },
          },
        },
      },
      {
        name: "migration_down",
        description:
          "Rollback data migrations. Specify number of migrations to rollback (default 1).",
        inputSchema: {
          type: "object",
          properties: {
            steps: {
              type: "number",
              description: "Number of migrations to rollback (default: 1)",
              default: 1,
            },
          },
        },
      },
      {
        name: "migration_create",
        description: "Create a new data migration file with the given name",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Name of the migration (lowercase, numbers, underscores only)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "migration_dry_run",
        description:
          "Preview which data migrations would be run without actually running them",
        inputSchema: {
          type: "object",
          properties: {
            steps: {
              type: "number",
              description: "Number of migrations to preview (optional)",
            },
          },
        },
      },
      {
        name: "migration_reset",
        description: "Rollback all data migrations",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "migration_fresh",
        description: "Rollback all data migrations and re-run them",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "migration_refresh",
        description:
          "Alias for migration_fresh - rollback all migrations and re-run them",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "prisma_migrate_dev",
        description:
          "Create and apply a new Prisma schema migration in development (wraps prisma migrate dev)",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the migration (optional)",
            },
          },
        },
      },
      {
        name: "prisma_migrate_deploy",
        description:
          "Apply pending Prisma schema migrations in production (wraps prisma migrate deploy)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "prisma_migrate_resolve",
        description:
          "Resolve migration issues by marking migrations as applied or rolled back (wraps prisma migrate resolve)",
        inputSchema: {
          type: "object",
          properties: {
            applied: {
              type: "string",
              description: "Mark a migration as applied",
            },
            rolledBack: {
              type: "string",
              description: "Mark a migration as rolled back",
            },
          },
        },
      },
      {
        name: "prisma_db_push",
        description:
          "Push schema changes to database without migrations (wraps prisma db push)",
        inputSchema: {
          type: "object",
          properties: {
            skipGenerate: {
              type: "boolean",
              description: "Skip generating Prisma Client",
              default: false,
            },
          },
        },
      },
      {
        name: "prisma_generate",
        description:
          "Generate Prisma Client based on your schema (wraps prisma generate)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "migration_status": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const pending = await migrations.pending();
        const applied = await migrations.applied();

        const status = {
          pending: pending.map((m: MigrationFile) => ({
            id: m.id,
            name: m.name,
            path: m.path,
          })),
          applied: applied.map((m: MigrationFile) => ({
            id: m.id,
            name: m.name,
            path: m.path,
          })),
        };

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      case "migration_pending": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const pending = await migrations.pending();

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                pending.map((m: MigrationFile) => ({
                  id: m.id,
                  name: m.name,
                  path: m.path,
                })),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "migration_applied": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const applied = await migrations.applied();

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                applied.map((m: MigrationFile) => ({
                  id: m.id,
                  name: m.name,
                  path: m.path,
                })),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "migration_up": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const steps = args?.steps as number | undefined;
        const count = await migrations.up(steps);

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: `Applied ${count} migration(s)`,
            },
          ],
        };
      }

      case "migration_down": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const steps = (args?.steps as number) || 1;
        const count = await migrations.down(steps);

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: WARNING_MESSAGES.MIGRATION_DOWN(count),
            },
          ],
        };
      }

      case "migration_create": {
        const migrationName = args?.name as string;

        if (!migrationName) {
          throw new Error("Migration name is required");
        }

        if (!validateMigrationName(migrationName)) {
          throw new Error(
            "Invalid migration name. Use only lowercase letters, numbers, and underscores.",
          );
        }

        const { create } = await import("../cli/commands/create/index.js");
        await create(migrationName);

        return {
          content: [
            {
              type: "text",
              text: `Created migration: ${migrationName}`,
            },
          ],
        };
      }

      case "migration_dry_run": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const steps = args?.steps as number | undefined;
        const pending = await migrations.dryRun(steps);

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                pending.map((m: MigrationFile) => ({
                  id: m.id,
                  name: m.name,
                  path: m.path,
                })),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "migration_reset": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const count = await migrations.reset();

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: WARNING_MESSAGES.MIGRATION_RESET(count),
            },
          ],
        };
      }

      case "migration_fresh": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const count = await migrations.fresh();

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: WARNING_MESSAGES.MIGRATION_FRESH(count),
            },
          ],
        };
      }

      case "migration_refresh": {
        const config = await loadConfig();
        const discovery = new Discovery();
        const prisma = await discovery.findPrismaClient(config);
        const migrations = new Migrations(prisma, config);

        const result = await migrations.refresh();

        await prisma.$disconnect();

        return {
          content: [
            {
              type: "text",
              text: WARNING_MESSAGES.MIGRATION_REFRESH(result.down, result.up),
            },
          ],
        };
      }

      case "prisma_migrate_dev": {
        const migrationName = args?.name as string | undefined;
        const prismaArgs = migrationName ? ["--name", migrationName] : [];

        const result = await execPrismaCommand("migrate", [
          "dev",
          ...prismaArgs,
        ]);

        return {
          content: [
            {
              type: "text",
              text: `Prisma migrate dev completed\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
            },
          ],
        };
      }

      case "prisma_migrate_deploy": {
        const result = await execPrismaCommand("migrate", ["deploy"]);

        return {
          content: [
            {
              type: "text",
              text: `Prisma migrate deploy completed\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
            },
          ],
        };
      }

      case "prisma_migrate_resolve": {
        const applied = args?.applied as string | undefined;
        const rolledBack = args?.rolledBack as string | undefined;

        const prismaArgs = [];
        if (applied) {
          prismaArgs.push("--applied", applied);
        }
        if (rolledBack) {
          prismaArgs.push("--rolled-back", rolledBack);
        }

        const result = await execPrismaCommand("migrate", [
          "resolve",
          ...prismaArgs,
        ]);

        return {
          content: [
            {
              type: "text",
              text: `Prisma migrate resolve completed\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
            },
          ],
        };
      }

      case "prisma_db_push": {
        const skipGenerate = args?.skipGenerate as boolean | undefined;

        const prismaArgs = skipGenerate ? ["--skip-generate"] : [];

        const result = await execPrismaCommand("db", ["push", ...prismaArgs]);

        return {
          content: [
            {
              type: "text",
              text: WARNING_MESSAGES.PRISMA_DB_PUSH(
                result.stdout,
                result.stderr,
              ),
            },
          ],
        };
      }

      case "prisma_generate": {
        const result = await execPrismaCommand("generate", []);

        return {
          content: [
            {
              type: "text",
              text: `Prisma generate completed\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Prisma Migrations MCP server running on stdio");
}

runServer().catch(console.error);
