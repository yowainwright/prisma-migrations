type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

interface ConfigHooks {
  beforeUp?: () => void | Promise<void>;
  afterUp?: () => void | Promise<void>;
  beforeDown?: () => void | Promise<void>;
  afterDown?: () => void | Promise<void>;
}

interface ValidatedConfig {
  migrationsDir?: string;
  disableLocking?: boolean;
  skipChecksumValidation?: boolean;
  lockTimeout?: number;
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

  if (typeof cfg.disableLocking === "boolean") {
    validated.disableLocking = cfg.disableLocking;
  }

  if (typeof cfg.skipChecksumValidation === "boolean") {
    validated.skipChecksumValidation = cfg.skipChecksumValidation;
  }

  if (
    typeof cfg.lockTimeout === "number" &&
    Number.isSafeInteger(cfg.lockTimeout) &&
    cfg.lockTimeout > 0
  ) {
    validated.lockTimeout = cfg.lockTimeout;
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
