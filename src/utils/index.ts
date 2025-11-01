import { createHash } from "crypto";
import { readFile } from "fs/promises";
import type { MigrationFile } from "../types";

export function generateMigrationId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "");
  return timestamp.substring(0, 14) + timestamp.substring(15, 18);
}

export function validateMigrationName(name: string): boolean {
  return /^[a-z0-9_]+$/.test(name);
}

export function formatMigration(m: MigrationFile): string {
  return `${m.id}_${m.name}`;
}

export async function generateChecksum(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

export { spinner, Spinner } from "./spinner";
export { createTable } from "./table";
export { colors } from "./colors";
