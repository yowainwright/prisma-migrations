import { createHash } from "crypto";
import { readFile } from "fs/promises";
import type { MigrationFile } from "../types";

export function generateMigrationId(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0]
    .replace("T", "");
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
