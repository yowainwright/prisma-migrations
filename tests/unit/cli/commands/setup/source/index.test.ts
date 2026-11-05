import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { parse } from "jsonc-parser";
import { setupSource } from "../../../../../../src/cli/commands/setup/source";

const fixtureRoot = fileURLToPath(
  new URL("../../../../../../tmp/", import.meta.url),
);
const fixtures: string[] = [];
const schema = `datasource db {
  provider = "postgresql"
}
generator client {
  provider = "prisma-client-js"
  output = "../src/generated/client"
}
`;

function createFixture(exports?: unknown, tsconfig = "{}") {
  mkdirSync(fixtureRoot, { recursive: true });
  const cwd = mkdtempSync(join(fixtureRoot, "setup-source-"));
  fixtures.push(cwd);
  mkdirSync(join(cwd, "prisma"));
  const pkg = JSON.stringify({ name: "source-fixture", exports });
  writeFileSync(join(cwd, "package.json"), pkg);
  writeFileSync(join(cwd, "prisma/schema.prisma"), schema);
  writeFileSync(join(cwd, "tsconfig.json"), tsconfig);
  return cwd;
}

function readFixture(cwd: string, path: string) {
  return readFileSync(join(cwd, path), "utf-8");
}

afterEach(() => {
  fixtures
    .splice(0)
    .forEach((cwd) => rmSync(cwd, { recursive: true, force: true }));
});

describe("setupSource", () => {
  test.each([
    ["string", "./dist/index.js"],
    ["conditional", { import: "./dist/index.js", require: "./dist/index.cjs" }],
  ])(
    "preserves %s root exports alongside database exports",
    async (_, original) => {
      const cwd = createFixture(original);
      await setupSource({ cwd });
      const pkg = JSON.parse(readFixture(cwd, "package.json"));
      expect(pkg.exports).toEqual({
        ".": original,
        "./db": {
          types: "./dist/db/index.d.ts",
          default: "./dist/db/index.js",
        },
        "./db/types": { types: "./dist/db/types.d.ts" },
      });
    },
  );

  test("preserves existing subpath exports", async () => {
    const original = { ".": "./dist/index.js", "./utils": "./dist/utils.js" };
    const cwd = createFixture(original);
    await setupSource({ cwd });
    const pkg = JSON.parse(readFixture(cwd, "package.json"));
    expect(pkg.exports["."]).toBe(original["."]);
    expect(pkg.exports["./utils"]).toBe(original["./utils"]);
    expect(pkg.exports["./db/types"]).toEqual({
      types: "./dist/db/types.d.ts",
    });
  });

  test("preserves JSONC comments, trailing commas, and a custom output directory", async () => {
    const tsconfig = `{
  // Keep the build configuration.
  "compilerOptions": {
    "outDir": "./build", // Published build directory.
    "strict": true,
  },
  "include": ["src"],
}`;
    const cwd = createFixture(undefined, tsconfig);
    await setupSource({ cwd });
    const text = readFixture(cwd, "tsconfig.json");
    expect(text).toContain("// Keep the build configuration.");
    expect(text).toContain("// Published build directory.");
    expect(text).toContain('"include": ["src"],');
    expect(parse(text).compilerOptions).toEqual({
      outDir: "./build",
      strict: true,
      declaration: true,
      declarationMap: true,
    });
  });

  test("creates missing compilerOptions without discarding other settings", async () => {
    const cwd = createFixture(
      undefined,
      '{"extends":"./base.json","include":["src"]}',
    );
    await setupSource({ cwd });
    const tsconfig = parse(readFixture(cwd, "tsconfig.json"));
    expect(tsconfig).toEqual({
      extends: "./base.json",
      include: ["src"],
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        outDir: "./dist",
      },
    });
  });

  test("keeps configured files unchanged on repeated setup", async () => {
    const cwd = createFixture();
    await setupSource({ cwd });
    const paths = [
      "package.json",
      "tsconfig.json",
      "prisma/schema.prisma",
      "src/db/index.ts",
      "src/db/types.ts",
      ".gitignore",
    ];
    const before = paths.map((path) => readFixture(cwd, path));
    await setupSource({ cwd });
    expect(paths.map((path) => readFixture(cwd, path))).toEqual(before);
  });

  test("rejects malformed JSONC without replacing the configuration", async () => {
    const original = '{"compilerOptions": invalid}';
    const cwd = createFixture(undefined, original);
    const exit = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("setup exited");
    });
    const output = spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(setupSource({ cwd })).rejects.toThrow("setup exited");
      expect(exit).toHaveBeenCalledWith(1);
      expect(output).toHaveBeenCalledWith(
        expect.stringContaining("Invalid tsconfig.json"),
      );
      expect(readFixture(cwd, "tsconfig.json")).toBe(original);
    } finally {
      exit.mockRestore();
      output.mockRestore();
    }
  });

  test("adds the native generator without constructing an unconfigured client", async () => {
    const cwd = createFixture();
    const prismaPackage = join(cwd, "node_modules/prisma");
    mkdirSync(prismaPackage, { recursive: true });
    writeFileSync(join(prismaPackage, "package.json"), '{"version":"7.10.1"}');
    writeFileSync(
      join(cwd, "prisma/schema.prisma"),
      'datasource db { provider = "postgresql" }',
    );
    await setupSource({ cwd });
    expect(readFixture(cwd, "prisma/schema.prisma")).toContain(
      'provider = "prisma-client"',
    );
    expect(readFixture(cwd, "src/db/index.ts")).toBe(
      'export * from "../generated/prisma/client";\n',
    );
    expect(readFixture(cwd, "src/db/types.ts")).toBe(
      'export type * from "../generated/prisma/client";\n',
    );
  });
});
