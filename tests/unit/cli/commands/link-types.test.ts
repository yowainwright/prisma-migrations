import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  detectPackageManager,
  isWorkspacePackage,
  linkTypes,
} from "../../../../src/cli/commands/setup/link-types";

const directories: string[] = [];

interface TestPackageJson {
  name?: string;
  devDependencies?: Record<string, string>;
}

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

async function createPackage(packageJson: TestPackageJson) {
  const root = await mkdtemp(join(tmpdir(), "prisma-package-"));
  const content = JSON.stringify(packageJson);
  directories.push(root);
  await writeFile(join(root, "package.json"), content);
  return root;
}

async function readPackageJson(directory: string) {
  const path = join(directory, "package.json");
  const content = await readFile(path, "utf-8");
  const parsed = JSON.parse(content) as TestPackageJson;
  return parsed;
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

  test("supports object workspace declarations", async () => {
    const root = await mkdtemp(join(tmpdir(), "prisma-workspace-"));
    const source = join(root, "modules", "source");
    const consumer = join(root, "modules", "consumer");
    const manifest = { workspaces: { packages: ["modules/source"] } };
    directories.push(root);
    await mkdir(source, { recursive: true });
    await mkdir(consumer, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    const sourcePackage = JSON.stringify({ name: "@test/source" });
    await writeFile(join(source, "package.json"), sourcePackage);

    expect(isWorkspacePackage("@test/source", consumer)).toBe(true);
  });

  test("ignores missing workspace directories and manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "prisma-workspace-"));
    const emptyPackage = join(root, "packages", "empty");
    const manifest = { workspaces: ["missing/*", "packages/*"] };
    directories.push(root);
    await mkdir(emptyPackage, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));

    expect(isWorkspacePackage("@test/missing", emptyPackage)).toBe(false);
  });
});

describe("package manager detection", () => {
  test("detects legacy Bun, pnpm, and Yarn lockfiles", async () => {
    const bunRoot = await createPackage({ name: "consumer" });
    const pnpmRoot = await createPackage({ name: "consumer" });
    const yarnRoot = await createPackage({ name: "consumer" });
    await writeFile(join(bunRoot, "bun.lockb"), "");
    await writeFile(join(pnpmRoot, "pnpm-lock.yaml"), "");
    await writeFile(join(yarnRoot, "yarn.lock"), "");

    expect(detectPackageManager(bunRoot)).toBe("bun");
    expect(detectPackageManager(pnpmRoot)).toBe("pnpm");
    expect(detectPackageManager(yarnRoot)).toBe("yarn");
  });

  test("defaults to npm without a recognized lockfile", async () => {
    const root = await createPackage({ name: "consumer" });

    expect(detectPackageManager(root)).toBe("npm");
  });
});

describe("linkTypes", () => {
  test("adds and installs a workspace dependency", async () => {
    const workspace = await createWorkspace();
    const runInstall = mock(() => undefined);
    await writeFile(join(workspace.root, "bun.lock"), "");

    const options = { cwd: workspace.consumer, runInstall };
    await linkTypes("@test/source", options);

    const packageJson = await readPackageJson(workspace.consumer);
    const dependency = packageJson.devDependencies?.["@test/source"];
    expect(dependency).toBe("workspace:*");
    expect(runInstall).toHaveBeenCalledWith("bun", ["install"], {
      cwd: workspace.consumer,
      stdio: "pipe",
    });
  });

  test("runs Yarn without an install argument", async () => {
    const root = await createPackage({ name: "consumer" });
    const runInstall = mock(() => undefined);
    await writeFile(join(root, "yarn.lock"), "");

    await linkTypes("@test/source", { cwd: root, runInstall });

    expect(runInstall).toHaveBeenCalledWith("yarn", [], {
      cwd: root,
      stdio: "pipe",
    });
  });

  test("adds an external dependency when install fails", async () => {
    const root = await createPackage({ name: "consumer" });
    const runInstall = mock(() => {
      throw new Error("install failed");
    });

    await linkTypes("@test/source", { cwd: root, runInstall });

    const packageJson = await readPackageJson(root);
    const dependency = packageJson.devDependencies?.["@test/source"];
    expect(dependency).toBe("latest");
  });

  test("keeps an existing dependency without installing", async () => {
    const devDependencies = { "@test/source": "1.2.3" };
    const root = await createPackage({ name: "consumer", devDependencies });
    const runInstall = mock(() => undefined);

    await linkTypes("@test/source", { cwd: root, runInstall });

    const packageJson = await readPackageJson(root);
    const dependency = packageJson.devDependencies?.["@test/source"];
    expect(dependency).toBe("1.2.3");
    expect(runInstall).not.toHaveBeenCalled();
  });

  test("requires a package manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "prisma-package-"));
    directories.push(root);

    const linking = linkTypes("@test/source", { cwd: root });

    await expect(linking).rejects.toThrow("package.json not found");
  });

  test("requires the consumer package name", async () => {
    const root = await createPackage({});

    const linking = linkTypes("@test/source", { cwd: root });

    await expect(linking).rejects.toThrow(
      "package.json must have a 'name' field",
    );
  });
});
