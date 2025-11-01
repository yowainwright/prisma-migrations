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

let logLevel: LogLevel =
  (process.env.PRISMA_MIGRATIONS_LOG_LEVEL as LogLevel) || "silent";

export const logger = new Logger(logLevel);

export function setLogLevel(level: string) {
  logLevel = level as LogLevel;
  logger.level = level;
}
