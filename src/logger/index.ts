type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

class Logger {
  private currentLevel: LogLevel;

  constructor(level: LogLevel = "silent") {
    this.currentLevel = level;
  }

  set level(level: string) {
    if (!isLogLevel(level)) {
      throw new Error(
        `Invalid log level "${level}". Expected one of: ${Object.keys(LOG_LEVELS).join(", ")}`,
      );
    }
    this.currentLevel = level as LogLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.currentLevel];
  }

  private log(level: LogLevel, message: unknown): void {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (message instanceof Error) {
      console.error(prefix, message.message);
      if (this.currentLevel === "debug" || this.currentLevel === "trace") {
        console.error(message.stack);
      }
    } else {
      console.log(prefix, message);
    }
  }

  trace(message: unknown): void {
    this.log("trace", message);
  }

  debug(message: unknown): void {
    this.log("debug", message);
  }

  info(message: unknown): void {
    this.log("info", message);
  }

  warn(message: unknown): void {
    this.log("warn", message);
  }

  error(message: unknown): void {
    this.log("error", message);
  }
}

function isLogLevel(level: string): level is LogLevel {
  return level in LOG_LEVELS;
}

const envLogLevel = process.env.PRISMA_MIGRATIONS_LOG_LEVEL;
let logLevel: LogLevel =
  envLogLevel && isLogLevel(envLogLevel) ? envLogLevel : "silent";

export const logger = new Logger(logLevel);

export function setLogLevel(level: string) {
  if (!isLogLevel(level)) {
    throw new Error(
      `Invalid log level "${level}". Expected one of: ${Object.keys(LOG_LEVELS).join(", ")}`,
    );
  }
  logLevel = level;
  logger.level = level;
}
