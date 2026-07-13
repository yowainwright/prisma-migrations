import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { colors } from "../../../utils/colors";

interface WorkspaceObject {
  packages: string[] | undefined;
}

interface PackageJson {
  name: string | undefined;
  workspaces: string[] | WorkspaceObject | undefined;
  devDependencies: Record<string, string> | undefined;
}

interface LinkTypesOptions {
  cwd: string | undefined;
}

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

function readPackageJson(cwd: string): PackageJson {
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath)) {
    throw new Error(
      "package.json not found. Run this from a package directory.",
    );
  }
  return JSON.parse(readFileSync(packagePath, "utf-8")) as PackageJson;
}

function writePackageJson(cwd: string, packageJson: PackageJson): void {
  const packagePath = join(cwd, "package.json");
  const content = `${JSON.stringify(packageJson, null, 2)}\n`;
  writeFileSync(packagePath, content);
}

function workspacePatterns(packageJson: PackageJson): string[] {
  if (!packageJson.workspaces) return [];
  if (Array.isArray(packageJson.workspaces)) return packageJson.workspaces;
  return packageJson.workspaces.packages || [];
}

function readPackageJsonIfPresent(cwd: string): PackageJson {
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath)) return {} as PackageJson;
  return readPackageJson(cwd);
}

function findWorkspaceRoot(cwd: string): string | null {
  const packageJson = readPackageJsonIfPresent(cwd);
  if (workspacePatterns(packageJson).length > 0) return cwd;
  const parent = dirname(cwd);
  if (parent === cwd) return null;
  return findWorkspaceRoot(parent);
}

function expandWorkspacePattern(root: string, pattern: string): string[] {
  if (!pattern.endsWith("/*")) return [join(root, pattern)];
  const base = join(root, pattern.slice(0, -2));
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name));
}

function packageNameAt(directory: string): string | undefined {
  const packagePath = join(directory, "package.json");
  if (!existsSync(packagePath)) return undefined;
  return readPackageJson(directory).name;
}

export function isWorkspacePackage(
  sourcePackage: string,
  cwd: string,
): boolean {
  const root = findWorkspaceRoot(cwd);
  if (!root) return false;
  const rootPackage = readPackageJson(root);
  const directories = workspacePatterns(rootPackage).flatMap((pattern) => {
    return expandWorkspacePattern(root, pattern);
  });
  return directories.some(
    (directory) => packageNameAt(directory) === sourcePackage,
  );
}

export function detectPackageManager(cwd: string): PackageManager {
  const hasBunLock = existsSync(join(cwd, "bun.lock"));
  const hasLegacyBunLock = existsSync(join(cwd, "bun.lockb"));
  if (hasBunLock || hasLegacyBunLock) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  const parent = dirname(cwd);
  if (parent === cwd) return "npm";
  return detectPackageManager(parent);
}

function installArguments(manager: PackageManager): string[] {
  if (manager === "yarn") return [];
  return ["install"];
}

function installDependencies(manager: PackageManager, cwd: string): void {
  try {
    execFileSync(manager, installArguments(manager), { cwd, stdio: "pipe" });
    console.log(colors.cyan("  Installed dependencies"));
  } catch {
    console.log(colors.yellow(`  Run '${manager} install' to finish linking`));
  }
}

function addDependency(
  packageJson: PackageJson,
  sourcePackage: string,
  version: string,
): boolean {
  if (!packageJson.devDependencies) packageJson.devDependencies = {};
  if (packageJson.devDependencies[sourcePackage]) return false;
  packageJson.devDependencies[sourcePackage] = version;
  return true;
}

function dependencyVersion(isWorkspace: boolean): string {
  if (isWorkspace) return "workspace:*";
  return "latest";
}

export async function linkTypes(
  sourcePackage: string,
  options: LinkTypesOptions,
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const packageJson = readPackageJson(cwd);
  if (!packageJson.name)
    throw new Error("package.json must have a 'name' field");
  const isWorkspace = isWorkspacePackage(sourcePackage, cwd);
  const version = dependencyVersion(isWorkspace);
  const added = addDependency(packageJson, sourcePackage, version);
  if (added) writePackageJson(cwd, packageJson);
  if (added) installDependencies(detectPackageManager(cwd), cwd);
  console.log(colors.green(`Linked types from ${sourcePackage}`));
  console.log(`import type * as Prisma from "${sourcePackage}/db/types";`);
}
