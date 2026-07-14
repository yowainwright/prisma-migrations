import type { MigrationHooks } from "../migrations";
import type { PrismaClient } from "../types";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";
export type PrismaClientFactory = () => PrismaClient | Promise<PrismaClient>;

export interface MigrationsConfig {
  migrationsDir?: string;
  disableLocking?: boolean;
  skipChecksumValidation?: boolean;
  lockTimeout?: number;
  lockLeaseDuration?: number;
  logLevel?: LogLevel;
  hooks?: MigrationHooks;
  clientFactory?: PrismaClientFactory;
}

type ConfigRecord = Record<string, unknown>;
type MigrationHook = NonNullable<MigrationHooks["beforeUp"]>;

const CONFIG_KEYS = new Set([
  "migrationsDir",
  "disableLocking",
  "skipChecksumValidation",
  "lockTimeout",
  "lockLeaseDuration",
  "logLevel",
  "hooks",
  "clientFactory",
]);
const HOOK_KEYS = new Set(["beforeUp", "afterUp", "beforeDown", "afterDown"]);
const LOG_LEVELS = new Set<LogLevel>([
  "silent",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

function toRecord(value: unknown, message: string): ConfigRecord {
  const isObject = typeof value === "object" && value !== null;
  if (!isObject) throw new Error(message);
  return value as ConfigRecord;
}

function assertKnownKeys(
  value: ConfigRecord,
  keys: Set<string>,
  kind: string,
): void {
  const unknownKey = Object.keys(value).find((key) => !keys.has(key));
  if (!unknownKey) return;
  throw new Error(`Unknown ${kind} "${unknownKey}"`);
}

function readString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Configuration option "${name}" must be a non-empty string`);
}

function readBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  throw new Error(`Configuration option "${name}" must be a boolean`);
}

function readPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  const isValid = Number.isSafeInteger(value) && Number(value) > 0;
  if (isValid) return Number(value);
  throw new Error(`Configuration option "${name}" must be a positive integer`);
}

function readLogLevel(value: unknown): LogLevel | undefined {
  if (value === undefined) return undefined;
  const isValid =
    typeof value === "string" && LOG_LEVELS.has(value as LogLevel);
  if (isValid) return value as LogLevel;
  throw new Error('Configuration option "logLevel" is invalid');
}

function readClientFactory(value: unknown): PrismaClientFactory | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "function") return value as PrismaClientFactory;
  throw new Error('Configuration option "clientFactory" must be a function');
}

function readHook(value: unknown, name: string): MigrationHook | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "function") return value as MigrationHook;
  throw new Error(`Hook "${name}" must be a function`);
}

function readHooks(value: unknown): MigrationHooks | undefined {
  if (value === undefined) return undefined;
  const hooks = toRecord(
    value,
    'Configuration option "hooks" must be an object',
  );
  assertKnownKeys(hooks, HOOK_KEYS, "hook");
  const beforeUp = readHook(hooks.beforeUp, "beforeUp");
  const afterUp = readHook(hooks.afterUp, "afterUp");
  const beforeDown = readHook(hooks.beforeDown, "beforeDown");
  const afterDown = readHook(hooks.afterDown, "afterDown");
  return { beforeUp, afterUp, beforeDown, afterDown };
}

export function validateConfig(config: unknown): MigrationsConfig {
  const message = "Configuration must be an object";
  const value = toRecord(config, message);
  assertKnownKeys(value, CONFIG_KEYS, "configuration option");
  const migrationsDir = readString(value.migrationsDir, "migrationsDir");
  const disableLocking = readBoolean(value.disableLocking, "disableLocking");
  const skipChecksumValidation = readBoolean(
    value.skipChecksumValidation,
    "skipChecksumValidation",
  );
  const lockTimeout = readPositiveInteger(value.lockTimeout, "lockTimeout");
  const lockLeaseDuration = readPositiveInteger(
    value.lockLeaseDuration,
    "lockLeaseDuration",
  );
  const logLevel = readLogLevel(value.logLevel);
  const hooks = readHooks(value.hooks);
  const clientFactory = readClientFactory(value.clientFactory);
  return {
    migrationsDir,
    disableLocking,
    skipChecksumValidation,
    lockTimeout,
    lockLeaseDuration,
    logLevel,
    hooks,
    clientFactory,
  };
}
