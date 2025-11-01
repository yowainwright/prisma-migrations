#!/usr/bin/env bun

import { build } from "bun";
import { existsSync, rmSync, chmodSync } from "fs";
import { join } from "path";

const clean = () => {
  const distDir = join(process.cwd(), "dist");
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true });
    console.log("✓ Cleaned dist directory");
  }
};

const buildLibrary = async () => {
  const result = await build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    sourcemap: "external",
    external: ["@prisma/client", "commander", "inquirer"],
    naming: {
      entry: "index.js",
    },
  });

  if (!result.success) {
    console.error("✗ Library build failed");
    process.exit(1);
  }

  console.log("✓ Built library");
};

const buildCLI = async () => {
  const result = await build({
    entrypoints: ["./src/cli/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    sourcemap: "external",
    external: ["@prisma/client", "commander", "inquirer"],
    naming: {
      entry: "cli.js",
    },
  });

  if (!result.success) {
    console.error("✗ CLI build failed");
    process.exit(1);
  }

  const cliPath = join(process.cwd(), "dist", "cli.js");
  const { readFileSync, writeFileSync } = await import("fs");
  const content = readFileSync(cliPath, "utf-8");
  writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
  chmodSync(cliPath, 0o755);

  console.log("✓ Built CLI");
};

const generateTypes = async () => {
  const { $ } = await import("bun");

  try {
    await $`bunx tsc --emitDeclarationOnly`;
    console.log("✓ Generated type declarations");
  } catch (error) {
    console.error("✗ Type generation failed");
    process.exit(1);
  }
};

const main = async () => {
  console.log("Building prisma-migrations...\n");

  clean();
  await buildLibrary();
  await buildCLI();
  await generateTypes();

  console.log("\n✓ Build completed successfully");
};

main();
