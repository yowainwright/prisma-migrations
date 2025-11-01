export const PROMPTS = {
  RESET_CONFIRM: {
    type: "confirm" as const,
    name: "confirm",
    message: (count: number) =>
      `Are you sure you want to rollback all ${count} migration(s)? This cannot be undone.`,
    default: false,
  },
  FRESH_CONFIRM: {
    type: "confirm" as const,
    name: "confirm",
    message: `Are you sure you want to rollback and re-run all migrations? This will reset your database.`,
    default: false,
  },
  REFRESH_CONFIRM: {
    type: "confirm" as const,
    name: "confirm",
    message: `Are you sure you want to rollback and re-run all migrations? This will reset your database.`,
    default: false,
  },
} as const;

export const MESSAGES = {
  NO_MIGRATIONS_TO_ROLLBACK: "No migrations to rollback",
  CANCELLED: "Cancelled",
} as const;
