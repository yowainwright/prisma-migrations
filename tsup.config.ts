import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    minify: false,
    bundle: true,
    external: [
      "@prisma/client",
      "commander",
      "inquirer",
      "chalk",
      "fs-extra",
      "tsx",
    ],
    outDir: "dist",
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    target: "node20",
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    minify: false,
    bundle: true,
    external: [
      "@prisma/client",
      "commander",
      "inquirer",
      "chalk",
      "fs-extra",
      "tsx",
    ],
    outDir: "dist",
    shims: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
