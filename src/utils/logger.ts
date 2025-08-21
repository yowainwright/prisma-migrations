import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

export const logger = pino({
  level: logLevel,
  transport: !isProduction ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
      singleLine: false,
    }
  } : undefined,
  base: {
    package: 'prisma-migrations'
  }
});

export const createLogger = (module: string) => {
  return logger.child({ module });
};
