import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { VersionMigrationMapping, MigrationManifest } from "../utils/types";
import { CommitManager } from "./commit";

export class VersionManager {
  private manifestPath: string;
  private manifest: MigrationManifest;

  private commitManager: CommitManager;

  constructor(migrationsDir: string) {
    this.manifestPath = join(migrationsDir, "migration-manifest.json");
    this.manifest = this.loadManifest();
    this.commitManager = new CommitManager();
  }

  private loadManifest(): MigrationManifest {
    if (existsSync(this.manifestPath)) {
      try {
        const content = readFileSync(this.manifestPath, "utf-8");
        const manifest = JSON.parse(content);

        manifest.lastUpdated = new Date(manifest.lastUpdated);
        manifest.versions = manifest.versions.map((v: any) => ({
          ...v,
          createdAt: new Date(v.createdAt),
        }));
        return manifest;
      } catch {
        console.warn("Failed to load migration manifest, creating new one");
      }
    }

    return {
      versions: [],
      lastUpdated: new Date(),
    };
  }

  private saveManifest(): void {
    writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }

  public registerVersion(
    version: string,
    migrations: string[],
    description?: string,
    commit?: string,
  ): void {
    const existingIndex = this.manifest.versions.findIndex(
      (v) => v.version === version,
    );

    const versionMapping: VersionMigrationMapping = {
      version,
      commit,
      migrations,
      description,
      createdAt: new Date(),
    };

    if (existingIndex >= 0) {
      this.manifest.versions[existingIndex] = versionMapping;
    } else {
      this.manifest.versions.push(versionMapping);
    }

    this.manifest.versions.sort((a, b) =>
      this.compareVersions(a.version, b.version),
    );
    this.manifest.lastUpdated = new Date();
    this.saveManifest();
  }

  public getMigrationsBetween(
    from: string | undefined,
    to: string,
    isCommit: boolean = false,
  ): {
    migrationsToRun: string[];
    migrationsToRollback: string[];
  } {
    let fromMigrations: Set<string> = new Set();
    let toMigrations: Set<string> = new Set();

    if (isCommit) {
      fromMigrations = from
        ? new Set(this.getCommitMigrations(from))
        : new Set();
      toMigrations = new Set(this.getCommitMigrations(to));
    } else {
      const fromVersionData = from ? this.getVersionData(from) : null;
      const toVersionData = this.getVersionData(to);

      if (!toVersionData) {
        throw new Error(`Version ${to} not found in manifest`);
      }

      fromMigrations = new Set(fromVersionData?.migrations || []);
      toMigrations = new Set(toVersionData.migrations);
    }

    const migrationsToRun = Array.from(toMigrations).filter(
      (m) => !fromMigrations.has(m),
    );

    const migrationsToRollback = Array.from(fromMigrations).filter(
      (m) => !toMigrations.has(m),
    );

    return {
      migrationsToRun,
      migrationsToRollback,
    };
  }

  private getCommitMigrations(commit: string): string[] {
    const info = this.commitManager.getCommitInfo(commit);

    const version = info.branch
      ? this.commitManager.getLatestTag(commit)
      : null;
    if (!version) {
      throw new Error(`No version tag found for commit ${commit}`);
    }

    const versionData = this.getVersionData(version);
    if (!versionData) {
      throw new Error(`Version data not found for tag ${version}`);
    }

    return versionData.migrations;
  }

  public getVersionData(version: string): VersionMigrationMapping | null {
    return this.manifest.versions.find((v) => v.version === version) || null;
  }

  public getAllVersions(): VersionMigrationMapping[] {
    return [...this.manifest.versions];
  }

  public getCurrentVersion(): string | undefined {
    return this.manifest.currentVersion;
  }

  public setCurrentVersion(version: string): void {
    this.manifest.currentVersion = version;
    this.manifest.lastUpdated = new Date();
    this.saveManifest();
  }

  public getLatestVersion(): string | undefined {
    if (this.manifest.versions.length === 0) return undefined;
    return this.manifest.versions[this.manifest.versions.length - 1].version;
  }

  private compareVersions(a: string, b: string): number {
    const parseVersion = (version: string) => {
      const parts = version.split(".").map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
      };
    };

    const versionA = parseVersion(a);
    const versionB = parseVersion(b);

    if (versionA.major !== versionB.major) {
      return versionA.major - versionB.major;
    }
    if (versionA.minor !== versionB.minor) {
      return versionA.minor - versionB.minor;
    }
    return versionA.patch - versionB.patch;
  }

  public validateVersionMigrations(
    version: string,
    existingMigrations: string[],
  ): boolean {
    const versionData = this.getVersionData(version);
    if (!versionData) return false;

    const existingSet = new Set(existingMigrations);
    return versionData.migrations.every((migration) =>
      existingSet.has(migration),
    );
  }

  public generateDeploymentPlan(
    fromVersion: string | undefined,
    toVersion: string,
  ): {
    plan: Array<{
      action: "run" | "rollback";
      migration: string;
      order: number;
    }>;
    summary: string;
  } {
    const { migrationsToRun, migrationsToRollback } = this.getMigrationsBetween(
      fromVersion,
      toVersion,
    );

    const plan: Array<{
      action: "run" | "rollback";
      migration: string;
      order: number;
    }> = [];

    migrationsToRollback.reverse().forEach((migration, index) => {
      plan.push({
        action: "rollback",
        migration,
        order: index + 1,
      });
    });

    migrationsToRun.forEach((migration, index) => {
      plan.push({
        action: "run",
        migration,
        order: migrationsToRollback.length + index + 1,
      });
    });

    const summary = `Deployment plan from ${fromVersion || "initial"} to ${toVersion}:
- ${migrationsToRollback.length} migration(s) to rollback
- ${migrationsToRun.length} migration(s) to run
- Total steps: ${plan.length}`;

    return { plan, summary };
  }
}
