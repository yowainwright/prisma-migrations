type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

interface ConfigHooks {
  beforeUp?: () => void | Promise<void>;
  afterUp?: () => void | Promise<void>;
  beforeDown?: () => void | Promise<void>;
  afterDown?: () => void | Promise<void>;
}

interface ValidatedConfig {
  migrationsDir?: string;
  prismaClient?: unknown;
  logLevel?: LogLevel;
  hooks?: ConfigHooks;
}

export function validateConfig(config: unknown): ValidatedConfig {
  if (typeof config !== "object" || config === null) {
    return {};
  }

  const cfg = config as Record<string, unknown>;
  const validated: ValidatedConfig = {};

  if (typeof cfg.migrationsDir === "string") {
    validated.migrationsDir = cfg.migrationsDir;
  }

  if (cfg.prismaClient !== undefined) {
    validated.prismaClient = cfg.prismaClient;
  }

  if (typeof cfg.logLevel === "string") {
    const validLevels: LogLevel[] = [
      "silent",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
    ];
    if (validLevels.includes(cfg.logLevel as LogLevel)) {
      validated.logLevel = cfg.logLevel as LogLevel;
    }
  }

  if (typeof cfg.hooks === "object" && cfg.hooks !== null) {
    const hooks = cfg.hooks as Record<string, unknown>;
    const validatedHooks: ConfigHooks = {};

    if (typeof hooks.beforeUp === "function") {
      validatedHooks.beforeUp = hooks.beforeUp as () => void | Promise<void>;
    }
    if (typeof hooks.afterUp === "function") {
      validatedHooks.afterUp = hooks.afterUp as () => void | Promise<void>;
    }
    if (typeof hooks.beforeDown === "function") {
      validatedHooks.beforeDown =
        hooks.beforeDown as () => void | Promise<void>;
    }
    if (typeof hooks.afterDown === "function") {
      validatedHooks.afterDown = hooks.afterDown as () => void | Promise<void>;
    }

    if (Object.keys(validatedHooks).length > 0) {
      validated.hooks = validatedHooks;
    }
  }

  return validated;
}
