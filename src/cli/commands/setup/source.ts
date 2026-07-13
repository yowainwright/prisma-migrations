import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname, join, relative, resolve } from "path";
import { colors } from "../../../utils/colors";

interface PackageJson {
  name?: string;
  exports?: Record<string, any>;
  [key: string]: any;
}

function readPackageJson(cwd: string): PackageJson {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(
      "package.json not found. Run this command from a package directory.",
    );
  }
  return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

function writePackageJson(cwd: string, pkg: PackageJson): void {
  const pkgPath = join(cwd, "package.json");
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function writeFileIfMissing(
  path: string,
  content: string,
  label: string,
): void {
  if (existsSync(path)) {
    console.log(colors.yellow(`  ${label} already exists - skipping`));
    return;
  }
  writeFileSync(path, content);
  console.log(colors.cyan(`  Created ${label}`));
}

interface SchemaUpdate {
  schema: string;
  provider: string;
  output: string;
}

interface GeneratorSetup {
  importPath: string;
  supportsSingleton: boolean;
}

const GENERATOR_PATTERN = /generator\s+client\s*\{[^}]*\}/;
const DATASOURCE_PATTERN = /(datasource\s+\w+\s*\{[^}]*\})/;
const PROVIDER_PATTERN = /provider\s*=\s*"([^"]+)"/;
const OUTPUT_PATTERN = /output\s*=\s*"([^"]+)"/;

function getPrismaMajorVersion(cwd: string): number {
  try {
    const require = createRequire(join(cwd, "package.json"));
    const packageJson = require("prisma/package.json") as Record<
      string,
      unknown
    >;
    return Number.parseInt(String(packageJson.version).split(".")[0], 10);
  } catch {
    return 6;
  }
}

function defaultProvider(majorVersion: number): string {
  if (majorVersion >= 7) return "prisma-client";
  return "prisma-client-js";
}

function outputForProvider(provider: string): string {
  if (provider === "prisma-client") return "../src/generated/prisma";
  return "../src/generated/client";
}

function readSetting(block: string, pattern: RegExp, fallback: string): string {
  const match = block.match(pattern);
  if (!match) return fallback;
  return match[1];
}

function addGenerator(schema: string, provider: string): SchemaUpdate {
  if (!DATASOURCE_PATTERN.test(schema))
    throw new Error("Prisma datasource not found");
  const output = outputForProvider(provider);
  const block = `generator client {\n  provider = "${provider}"\n  output = "${output}"\n}`;
  const updated = schema.replace(DATASOURCE_PATTERN, `$1\n\n${block}`);
  return { schema: updated, provider, output };
}

function updateGenerator(schema: string, block: string): SchemaUpdate {
  const provider = readSetting(block, PROVIDER_PATTERN, "prisma-client-js");
  const defaultOutput = outputForProvider(provider);
  const output = readSetting(block, OUTPUT_PATTERN, defaultOutput);
  if (OUTPUT_PATTERN.test(block)) return { schema, provider, output };
  const updatedBlock = block.replace(/\}$/, `  output = "${output}"\n}`);
  return { schema: schema.replace(block, updatedBlock), provider, output };
}

function configureSchema(schema: string, provider: string): SchemaUpdate {
  const match = schema.match(GENERATOR_PATTERN);
  if (!match) return addGenerator(schema, provider);
  return updateGenerator(schema, match[0]);
}

function generatedImportPath(
  schemaPath: string,
  output: string,
  provider: string,
): string {
  const dbDirectory = resolve(dirname(schemaPath), "../src/db");
  const outputDirectory = resolve(dirname(schemaPath), output);
  const relativePath = relative(dbDirectory, outputDirectory).replaceAll(
    "\\",
    "/",
  );
  const importPath = relativePath.startsWith(".")
    ? relativePath
    : `./${relativePath}`;
  if (provider === "prisma-client") return `${importPath}/client`;
  return importPath;
}

function updatePrismaSchema(schemaPath: string, cwd: string): GeneratorSetup {
  if (!existsSync(schemaPath))
    throw new Error(`Prisma schema not found at ${schemaPath}`);
  const schema = readFileSync(schemaPath, "utf-8");
  const provider = defaultProvider(getPrismaMajorVersion(cwd));
  const update = configureSchema(schema, provider);
  writeFileSync(schemaPath, update.schema);
  const importPath = generatedImportPath(
    schemaPath,
    update.output,
    update.provider,
  );
  const supportsSingleton = update.provider !== "prisma-client";
  return { importPath, supportsSingleton };
}

function runtimeDbContent(setup: GeneratorSetup): string {
  const exports = `export * from "${setup.importPath}";\n`;
  if (!setup.supportsSingleton) return exports;
  return `${exports}\nimport { PrismaClient } from "${setup.importPath}";\nexport const db = new PrismaClient();\n`;
}

function createDbFiles(srcDir: string, setup: GeneratorSetup): void {
  const dbDir = join(srcDir, "db");

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const typesPath = join(dbDir, "types.ts");
  const typesContent = `export type * from "${setup.importPath}";\n`;

  writeFileIfMissing(typesPath, typesContent, "src/db/types.ts");

  const indexPath = join(dbDir, "index.ts");
  const indexContent = runtimeDbContent(setup);

  writeFileIfMissing(indexPath, indexContent, "src/db/index.ts");
}

function updatePackageJsonExports(
  pkg: PackageJson,
  _packageName: string,
): PackageJson {
  const updated = { ...pkg };

  if (!updated.exports) {
    updated.exports = {};
  }

  // Add db exports
  updated.exports["./db"] = {
    types: "./dist/db/index.d.ts",
    default: "./dist/db/index.js",
  };

  // Add db/types exports (type-only)
  updated.exports["./db/types"] = {
    types: "./dist/db/types.d.ts",
  };

  console.log(colors.cyan(`  Updated package.json exports`));
  return updated;
}

function updateTsConfig(cwd: string): void {
  const tsconfigPath = join(cwd, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    console.log(
      colors.yellow(
        "  tsconfig.json not found - you may need to configure TypeScript manually",
      ),
    );
    return;
  }

  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));

  if (!tsconfig.compilerOptions) {
    tsconfig.compilerOptions = {};
  }

  // Ensure proper settings for exports
  const updates: Record<string, any> = {
    declaration: true,
    declarationMap: true,
  };

  // Only set outDir if not already set
  if (!tsconfig.compilerOptions.outDir) {
    updates.outDir = "./dist";
  }

  let updated = false;
  for (const [key, value] of Object.entries(updates)) {
    if (tsconfig.compilerOptions[key] !== value) {
      tsconfig.compilerOptions[key] = value;
      updated = true;
    }
  }

  if (updated) {
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
    console.log(colors.cyan("  Updated tsconfig.json"));
  }
}

function addToGitignore(cwd: string): void {
  const gitignorePath = join(cwd, ".gitignore");
  const entries = ["src/generated/", "dist/"];

  let gitignore = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";

  let added = false;
  for (const entry of entries) {
    if (!gitignore.includes(entry)) {
      gitignore += `\n${entry}`;
      added = true;
    }
  }

  if (added) {
    writeFileSync(gitignorePath, gitignore.trim() + "\n");
    console.log(colors.cyan("  Updated .gitignore"));
  }
}

export async function setupSource(options: {
  cwd?: string;
  skipTypes?: boolean;
}) {
  const cwd = options.cwd || process.cwd();

  console.log(colors.bold("\nSetting up source package for type exports...\n"));

  try {
    // 1. Read and validate package.json
    const pkg = readPackageJson(cwd);
    if (!pkg.name) {
      throw new Error("package.json must have a 'name' field");
    }

    console.log(colors.gray(`Package: ${colors.bold(pkg.name)}\n`));

    const schemaPath = join(cwd, "prisma", "schema.prisma");
    const generatorSetup = updatePrismaSchema(schemaPath, cwd);

    if (!options.skipTypes) {
      const srcDir = join(cwd, "src");
      if (!existsSync(srcDir)) {
        mkdirSync(srcDir, { recursive: true });
      }
      createDbFiles(srcDir, generatorSetup);

      // 4. Update package.json exports
      const updatedPkg = updatePackageJsonExports(pkg, pkg.name);
      writePackageJson(cwd, updatedPkg);

      // 5. Update tsconfig.json
      updateTsConfig(cwd);

      // 6. Update .gitignore
      addToGitignore(cwd);
    }

    console.log("");
    console.log(colors.green("✓ Source package configured!"));
    console.log("");
    console.log(colors.bold("Next steps:"));
    console.log(colors.gray("  1. Run: prisma generate"));
    console.log(colors.gray("  2. Build your package: npm run build"));
    console.log(colors.gray("  3. In consumer packages, run:"));
    console.log(colors.gray(`     prisma-migrations link-types ${pkg.name}`));
    console.log("");
  } catch (error) {
    console.log("");
    console.log(
      colors.red(
        `✗ Error: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    process.exit(1);
  }
}
