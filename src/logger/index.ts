import pino from "pino";

let logLevel = process.env.PRISMA_MIGRATIONS_LOG_LEVEL || "silent";

export const logger = pino({
  level: logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:HH:MM:ss",
    },
  },
});

export function setLogLevel(level: string) {
  logLevel = level;
  logger.level = level;
}
