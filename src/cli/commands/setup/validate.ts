import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { colors } from "../../../utils/colors";

interface PackageJson {
  name?: string;
  exports?: Record<string, any>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

function readPackageJson(cwd: string): PackageJson | null {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

function validateSourcePackage(cwd: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    info: [],
  };

  const pkg = readPackageJson(cwd);
  if (!pkg) {
    result.isValid = false;
    result.errors.push("package.json not found");
    return result;
  }

  result.info.push(`Package name: ${pkg.name || "unnamed"}`);

  const schemaPath = join(cwd, "prisma", "schema.prisma");
  if (!existsSync(schemaPath)) {
    result.isValid = false;
    result.errors.push("prisma/schema.prisma not found");
  } else {
    const schema = readFileSync(schemaPath, "utf-8");

    if (!schema.includes("output")) {
      result.warnings.push("Prisma generator missing custom output path");
      result.warnings.push("  Run: prisma-migrations setup-source");
    } else if (schema.includes("../src/generated/client")) {
      result.info.push("✓ Custom output configured");
    }
  }

  const dbIndexPath = join(cwd, "src", "db", "index.ts");
  const dbTypesPath = join(cwd, "src", "db", "types.ts");

  if (!existsSync(dbIndexPath)) {
    result.warnings.push("src/db/index.ts not found");
    result.warnings.push("  Run: prisma-migrations setup-source");
  } else {
    result.info.push("✓ Runtime exports found");
  }

  if (!existsSync(dbTypesPath)) {
    result.warnings.push("src/db/types.ts not found");
    result.warnings.push("  Run: prisma-migrations setup-source");
  } else {
    result.info.push("✓ Type-only exports found");
  }

  if (!pkg.exports || !pkg.exports["./db/types"]) {
    result.warnings.push("package.json missing type exports");
    result.warnings.push("  Run: prisma-migrations setup-source");
  } else {
    result.info.push("✓ Package exports configured");
  }

  const generatedPath = join(cwd, "src", "generated", "client");
  if (!existsSync(generatedPath)) {
    result.warnings.push("Generated client not found");
    result.warnings.push("  Run: prisma generate");
  } else {
    result.info.push("✓ Generated client exists");
  }

  const distPath = join(cwd, "dist");
  if (!existsSync(distPath)) {
    result.warnings.push("Built output (dist/) not found");
    result.warnings.push(
      "  Run your build command (e.g., tsc or npm run build)",
    );
  } else {
    const distDbTypes = join(distPath, "db", "types.d.ts");
    if (!existsSync(distDbTypes)) {
      result.warnings.push("dist/db/types.d.ts not found");
      result.warnings.push("  Run your build command");
    } else {
      result.info.push("✓ Built types available");
    }
  }

  return result;
}

function validateConsumerPackage(
  cwd: string,
  sourcePackage?: string,
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    info: [],
  };

  const pkg = readPackageJson(cwd);
  if (!pkg) {
    result.isValid = false;
    result.errors.push("package.json not found");
    return result;
  }

  result.info.push(`Package name: ${pkg.name || "unnamed"}`);

  if (sourcePackage) {
    const hasInDeps = pkg.dependencies?.[sourcePackage];
    const hasInDevDeps = pkg.devDependencies?.[sourcePackage];

    if (!hasInDeps && !hasInDevDeps) {
      result.errors.push(
        `Source package "${sourcePackage}" not found in dependencies`,
      );
      result.errors.push(
        `  Run: prisma-migrations link-types ${sourcePackage}`,
      );
      result.isValid = false;
    } else {
      const version = hasInDevDeps || hasInDeps;
      result.info.push(`✓ ${sourcePackage} linked (${version})`);
    }
  } else {
    result.warnings.push("No source package specified for validation");
    result.warnings.push(
      "  Usage: prisma-migrations validate --source <package-name>",
    );
  }

  return result;
}

export async function validate(options: {
  cwd?: string;
  source?: boolean;
  check?: string;
}) {
  const cwd = options.cwd || process.cwd();

  console.log(colors.bold("\nValidating monorepo setup...\n"));

  let result: ValidationResult;

  if (options.source) {
    console.log(colors.gray("Mode: Source package\n"));
    result = validateSourcePackage(cwd);
  } else {
    console.log(
      colors.gray(
        `Mode: Consumer package${options.check ? ` (checking ${options.check})` : ""}\n`,
      ),
    );
    result = validateConsumerPackage(cwd, options.check);
  }

  if (result.info.length > 0) {
    console.log(colors.bold("Status:"));
    result.info.forEach((msg) => {
      console.log(colors.gray(`  ${msg}`));
    });
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log(colors.yellow("⚠ Warnings:"));
    result.warnings.forEach((msg) => {
      console.log(colors.yellow(`  ${msg}`));
    });
    console.log("");
  }

  if (result.errors.length > 0) {
    console.log(colors.red("✗ Errors:"));
    result.errors.forEach((msg) => {
      console.log(colors.red(`  ${msg}`));
    });
    console.log("");
    process.exit(1);
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log(colors.green("✓ All checks passed!"));
    console.log("");
  } else if (result.isValid) {
    console.log(colors.yellow("✓ Setup is functional but has warnings"));
    console.log("");
  }
}
