import type { CodeLine } from "./types";

export const TERMINAL_COLORS = {
  red: '#FF5F56',
  yellow: '#FFBD2E',
  green: '#27C93F',
};

export const codeLines: CodeLine[] = [
  { prefix: "$", content: "npm install prisma-migrations", spotlight: true, delay: 0 },
  { prefix: "", content: "added 15 packages in 2s", className: "text-base-content/60" },
  { prefix: "", content: "" },
  {
    prefix: "$",
    content: "npx prisma-migrations init",
    className: "mt-2",
    spotlight: true,
    delay: 1500,
  },
  {
    prefix: "",
    content: "✓ Created migration: 1234567890_initial_migration",
    className: "text-success",
    spotlight: true,
    delay: 3000,
  },
  {
    prefix: "",
    content: "  Location: ./prisma/migrations/1234567890_initial_migration",
    className: "text-base-content/60",
  },
  { prefix: "", content: "" },
  {
    prefix: "$",
    content: "npx prisma-migrations create add_users_table",
    spotlight: true,
    delay: 4500,
  },
  {
    prefix: "",
    content: "✓ Created migration: 1234567891_add_users_table",
    className: "text-success",
    spotlight: true,
    delay: 6000,
  },
  { prefix: "", content: "" },
  {
    prefix: "$",
    content: "npx prisma-migrations up",
    spotlight: true,
    delay: 7500,
  },
  {
    prefix: "",
    content: "Running 1234567891_add_users_table...",
    className: "text-info",
  },
  {
    prefix: "",
    content: "✓ Applied 1234567891_add_users_table",
    className: "text-success",
    spotlight: true,
    delay: 9000,
  },
  { prefix: "", content: "" },
  {
    prefix: "",
    content: "┌────────┬─────────────────────┐",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "│ Status │ Migrations          │",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "├────────┼─────────────────────┤",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "│ ✓      │ 1 migration applied │",
    className: "text-success",
    spotlight: true,
    delay: 10500,
  },
  {
    prefix: "",
    content: "└────────┴─────────────────────┘",
    className: "text-base-content/60",
  },
];
