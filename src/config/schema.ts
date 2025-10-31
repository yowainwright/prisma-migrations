import { z } from "zod";

export const configSchema = z.object({
  migrationsDir: z.string().optional(),
  prismaClient: z.any().optional(),
  logLevel: z
    .enum(["silent", "error", "warn", "info", "debug", "trace"])
    .optional(),
  hooks: z
    .object({
      beforeUp: z.function().optional(),
      afterUp: z.function().optional(),
      beforeDown: z.function().optional(),
      afterDown: z.function().optional(),
    })
    .optional(),
});

export function validateConfig(config: unknown) {
  return configSchema.parse(config);
}
