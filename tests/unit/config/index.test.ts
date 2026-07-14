import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadConfig } from "../../../src/config";

const directories: string[] = [];

async function createTestDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "prisma-migrations-config-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const removals = directories.splice(0).map((directory) => {
    return rm(directory, { recursive: true, force: true });
  });
  await Promise.all(removals);
});

describe("loadConfig", () => {
  test("rejects malformed configuration files", async () => {
    const directory = await createTestDirectory();
    const configPath = join(directory, ".prisma-migrationsrc.json");
    await writeFile(configPath, "{ invalid json");

    await expect(loadConfig(directory)).rejects.toThrow(
      "Failed to load configuration",
    );
  });

  test("loads configuration from package.json", async () => {
    const directory = await createTestDirectory();
    const packagePath = join(directory, "package.json");
    const packageJson = { "prisma-migrations": { lockTimeout: 1200 } };
    await writeFile(packagePath, JSON.stringify(packageJson));

    const config = await loadConfig(directory);

    expect(config.lockTimeout).toBe(1200);
  });

  test("loads a client factory from JavaScript configuration", async () => {
    const directory = await createTestDirectory();
    const configPath = join(directory, "prisma-migrations.config.js");
    await writeFile(
      configPath,
      "module.exports = { clientFactory: () => ({}) };\n",
    );

    const config = await loadConfig(directory);

    expect(config.clientFactory).toBeFunction();
  });
});
