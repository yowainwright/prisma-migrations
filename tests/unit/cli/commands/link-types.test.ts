import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  detectPackageManager,
  isWorkspacePackage,
} from "../../../../src/cli/commands/setup/link-types";

const directories: string[] = [];

async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "prisma-workspace-"));
  const source = join(root, "packages", "source");
  const consumer = join(root, "packages", "consumer");
  directories.push(root);
  await mkdir(source, { recursive: true });
  await mkdir(consumer, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ workspaces: ["packages/*"] }),
  );
  await writeFile(
    join(source, "package.json"),
    JSON.stringify({ name: "@test/source" }),
  );
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ name: "@test/consumer" }),
  );
  return { root, consumer };
}

afterEach(async () => {
  const removals = directories.splice(0).map((directory) => {
    return rm(directory, { recursive: true, force: true });
  });
  await Promise.all(removals);
});

describe("workspace detection", () => {
  test("matches the requested workspace package by name", async () => {
    const workspace = await createWorkspace();

    expect(isWorkspacePackage("@test/source", workspace.consumer)).toBe(true);
    expect(isWorkspacePackage("@test/missing", workspace.consumer)).toBe(false);
  });

  test("detects a modern Bun lockfile at the workspace root", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace.root, "bun.lock"), "");

    expect(detectPackageManager(workspace.consumer)).toBe("bun");
  });
});
