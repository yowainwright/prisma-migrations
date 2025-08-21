import pino from "pino";
import type { Logger } from "./types";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

let globalLogger: Logger | undefined;

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

export function getDefaultLogger(): Logger {
  const pinoOptions: any = {
    level: logLevel,
    base: {
      package: "prisma-migrations",
    },
  };

  if (!isProduction) {
    pinoOptions.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:standard",
        singleLine: false,
        destination: 2,
      },
    };
  } else {
    pinoOptions.destination = pino.destination(2);
  }

  return pino(pinoOptions) as Logger;
}

export const logger: Logger = globalLogger || getDefaultLogger();

export const createLogger = (module: string, customLogger?: Logger): Logger => {
  const baseLogger = customLogger || globalLogger || getDefaultLogger();
  if (baseLogger.child) {
    return baseLogger.child({ module });
  }
  return baseLogger;
};
