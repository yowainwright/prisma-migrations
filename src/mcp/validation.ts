import {
  ALLOWED_PRISMA_COMMANDS,
  ALLOWED_MIGRATE_SUBCOMMANDS,
  ALLOWED_DB_SUBCOMMANDS,
  DANGEROUS_CHARACTERS,
} from "./constants.js";

function validateArguments(args: string[]): void {
  const hasInvalidType = args.some((arg) => typeof arg !== "string");
  if (hasInvalidType) {
    throw new Error("Invalid argument type");
  }

  const hasDangerousCharacters = args.some((arg) =>
    DANGEROUS_CHARACTERS.some((char) => arg.includes(char)),
  );
  if (hasDangerousCharacters) {
    throw new Error("Invalid characters in argument");
  }

  const hasPathTraversal = args.some((arg) => arg.includes(".."));
  if (hasPathTraversal) {
    throw new Error("Path traversal not allowed in arguments");
  }
}

export function validatePrismaCommand(command: string, args: string[]): void {
  if (!ALLOWED_PRISMA_COMMANDS.has(command)) {
    throw new Error(`Prisma command not allowed: ${command}`);
  }

  validateArguments(args);

  if (args.length === 0) {
    return;
  }

  const subcommand = args[0];

  switch (command) {
    case "migrate":
      if (
        !subcommand.startsWith("--") &&
        !ALLOWED_MIGRATE_SUBCOMMANDS.has(subcommand)
      ) {
        throw new Error(`Migrate subcommand not allowed: ${subcommand}`);
      }
      break;

    case "db":
      if (
        !subcommand.startsWith("--") &&
        !ALLOWED_DB_SUBCOMMANDS.has(subcommand)
      ) {
        throw new Error(`DB subcommand not allowed: ${subcommand}`);
      }
      break;

    case "generate":
      break;

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
