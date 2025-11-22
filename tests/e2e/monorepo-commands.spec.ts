import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import path from "path";

const TEST_DIR = path.join(import.meta.dir, "monorepo-test");
const SOURCE_DIR = path.join(TEST_DIR, "packages", "source");
const CONSUMER_DIR = path.join(TEST_DIR, "packages", "consumer");

function runCLI(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const cwd = options.cwd || SOURCE_DIR;
    const env = {
      ...process.env,
      ...options.env,
    };
    const cliPath = path.join(import.meta.dir, "..", "..", "dist", "cli.js");

    const child = spawn("node", [cliPath, ...args], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });
  });
}

beforeAll(async () => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  mkdirSync(SOURCE_DIR, { recursive: true });
  mkdirSync(CONSUMER_DIR, { recursive: true });

  writeFileSync(
    path.join(TEST_DIR, "package.json"),
    JSON.stringify(
      {
        name: "monorepo-root",
        private: true,
        workspaces: ["packages/*"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(SOURCE_DIR, "package.json"),
    JSON.stringify(
      {
        name: "@test/source",
        version: "1.0.0",
        main: "dist/index.js",
        types: "dist/index.d.ts",
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(CONSUMER_DIR, "package.json"),
    JSON.stringify(
      {
        name: "@test/consumer",
        version: "1.0.0",
        devDependencies: {},
      },
      null,
      2,
    ),
  );

  const schemaDir = path.join(SOURCE_DIR, "prisma");
  mkdirSync(schemaDir, { recursive: true });

  writeFileSync(
    path.join(schemaDir, "schema.prisma"),
    `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`,
  );

  const srcDir = path.join(SOURCE_DIR, "src");
  mkdirSync(srcDir, { recursive: true });

  writeFileSync(
    path.join(SOURCE_DIR, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          outDir: "./dist",
        },
      },
      null,
      2,
    ),
  );
});

afterAll(async () => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("Monorepo Commands E2E", () => {
  describe("setup-source command", () => {
    it("should configure source package for type exports", async () => {
      const result = await runCLI(["setup-source"], { cwd: SOURCE_DIR });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Source package configured");

      const schemaPath = path.join(SOURCE_DIR, "prisma", "schema.prisma");
      const schemaContent = readFileSync(schemaPath, "utf-8");
      expect(schemaContent).toContain("generator client");
      expect(schemaContent).toContain("../src/generated/client");

      const dbTypesPath = path.join(SOURCE_DIR, "src", "db", "types.ts");
      expect(existsSync(dbTypesPath)).toBe(true);

      const dbIndexPath = path.join(SOURCE_DIR, "src", "db", "index.ts");
      expect(existsSync(dbIndexPath)).toBe(true);

      const pkgPath = path.join(SOURCE_DIR, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      expect(pkg.exports).toBeDefined();
      expect(pkg.exports["./db"]).toBeDefined();
      expect(pkg.exports["./db/types"]).toBeDefined();
    });

    it("should update tsconfig.json with proper settings", async () => {
      const tsconfigPath = path.join(SOURCE_DIR, "tsconfig.json");
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));

      expect(tsconfig.compilerOptions.declaration).toBe(true);
      expect(tsconfig.compilerOptions.declarationMap).toBe(true);
    });

    it("should update .gitignore", async () => {
      const gitignorePath = path.join(SOURCE_DIR, ".gitignore");
      if (existsSync(gitignorePath)) {
        const gitignore = readFileSync(gitignorePath, "utf-8");
        expect(gitignore).toContain("src/generated/");
        expect(gitignore).toContain("dist/");
      }
    });
  });

  describe("link-types command", () => {
    it("should link source package types to consumer package", async () => {
      const result = await runCLI(["link-types", "@test/source"], {
        cwd: CONSUMER_DIR,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Types linked");

      const pkgPath = path.join(CONSUMER_DIR, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      expect(pkg.devDependencies["@test/source"]).toBeDefined();
    });

    it("should detect workspace setup", async () => {
      await runCLI(["link-types", "@test/source"], {
        cwd: CONSUMER_DIR,
      });

      const pkgPath = path.join(CONSUMER_DIR, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      expect(pkg.devDependencies["@test/source"]).toBe("workspace:*");
    });
  });

  describe("validate command", () => {
    it("should validate source package setup", async () => {
      const result = await runCLI(["validate", "--source"], {
        cwd: SOURCE_DIR,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("@test/source");
    });

    it("should show warnings for missing generated client", async () => {
      const result = await runCLI(["validate", "--source"], {
        cwd: SOURCE_DIR,
      });

      expect(result.stdout).toMatch(/Generated client|prisma generate/);
    });

    it("should validate consumer package with source check", async () => {
      const result = await runCLI(["validate", "--check", "@test/source"], {
        cwd: CONSUMER_DIR,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("@test/consumer");
    });

    it("should show error if source package not linked in consumer", async () => {
      const tempConsumerDir = path.join(TEST_DIR, "packages", "temp-consumer");
      mkdirSync(tempConsumerDir, { recursive: true });

      writeFileSync(
        path.join(tempConsumerDir, "package.json"),
        JSON.stringify(
          {
            name: "@test/temp-consumer",
            version: "1.0.0",
            devDependencies: {},
          },
          null,
          2,
        ),
      );

      const result = await runCLI(["validate", "--check", "@test/source"], {
        cwd: tempConsumerDir,
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("not found in dependencies");

      rmSync(tempConsumerDir, { recursive: true, force: true });
    });

    it("should show validation errors clearly", async () => {
      const tempDir = path.join(TEST_DIR, "packages", "invalid");
      mkdirSync(tempDir, { recursive: true });

      writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(
          {
            name: "@test/invalid",
            version: "1.0.0",
          },
          null,
          2,
        ),
      );

      const result = await runCLI(["validate", "--source"], { cwd: tempDir });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Errors:");

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("validate options", () => {
    it("should show mode in output for source package", async () => {
      const result = await runCLI(["validate", "--source"], {
        cwd: SOURCE_DIR,
      });

      expect(result.stdout).toContain("Source package");
    });

    it("should show mode in output for consumer package", async () => {
      const result = await runCLI(["validate", "--check", "@test/source"], {
        cwd: CONSUMER_DIR,
      });

      expect(result.stdout).toContain("Consumer package");
      expect(result.stdout).toContain("@test/source");
    });
  });
});
