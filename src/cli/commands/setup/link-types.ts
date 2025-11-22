import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { colors } from "../../../utils/colors";
import { execSync } from "child_process";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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

function detectPackageManager(cwd: string): "npm" | "pnpm" | "yarn" | "bun" {
  // Check for lock files
  if (existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

function isWorkspacePackage(_sourcePackage: string, cwd: string): boolean {
  // Walk up directory tree looking for workspace root
  let currentDir = cwd;
  const root = "/";

  while (currentDir !== root) {
    const pkgPath = join(currentDir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.workspaces) {
        // This is a workspace root
        return true;
      }
    }
    currentDir = join(currentDir, "..");
  }

  return false;
}

export async function linkTypes(
  sourcePackage: string,
  options: { cwd?: string },
) {
  const cwd = options.cwd || process.cwd();

  console.log(colors.bold(`\nLinking types from ${sourcePackage}...\n`));

  try {
    // 1. Read consumer package.json
    const pkg = readPackageJson(cwd);
    if (!pkg.name) {
      throw new Error("package.json must have a 'name' field");
    }

    console.log(colors.gray(`Consumer package: ${colors.bold(pkg.name)}\n`));

    // 2. Check if source package is in workspace
    const isWorkspace = isWorkspacePackage(sourcePackage, cwd);
    const packageManager = detectPackageManager(cwd);

    // 3. Add dependency
    if (!pkg.devDependencies) {
      pkg.devDependencies = {};
    }

    const dependencyValue = isWorkspace ? "workspace:*" : "latest";

    if (!pkg.devDependencies[sourcePackage]) {
      pkg.devDependencies[sourcePackage] = dependencyValue;
      writePackageJson(cwd, pkg);
      console.log(colors.cyan(`  Added ${sourcePackage} to devDependencies`));

      // 4. Install dependency
      try {
        console.log(colors.gray(`  Running ${packageManager} install...`));
        const installCmd =
          packageManager === "yarn" ? "yarn" : `${packageManager} install`;

        execSync(installCmd, {
          cwd,
          stdio: "pipe",
        });
        console.log(colors.cyan(`  Installed dependencies`));
      } catch {
        console.log(
          colors.yellow(
            `  Warning: Could not auto-install. Run '${packageManager} install' manually`,
          ),
        );
      }
    } else {
      console.log(colors.gray(`  ${sourcePackage} already in devDependencies`));
    }

    console.log("");
    console.log(colors.green("✓ Types linked!"));
    console.log("");
    console.log(colors.bold("Usage:"));
    console.log(
      colors.gray(
        `  import type * as Prisma from "${sourcePackage}/db/types";`,
      ),
    );
    console.log("");
    console.log(colors.bold("Example with Kysely:"));
    console.log(colors.gray(`  type Database = {`));
    console.log(colors.gray(`    Site: Prisma.Site;`));
    console.log(colors.gray(`    Domain: Prisma.Domain;`));
    console.log(colors.gray(`  };`));
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
