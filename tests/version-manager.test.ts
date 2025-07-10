import assert from "node:assert";
import { describe, it, before } from "node:test";
import { VersionManager } from "../src/version-manager";

// Test configurations for VersionManager functionality
describe("VersionManager", () => {
  let versionManager: VersionManager;

  before(() => {
    versionManager = new VersionManager("fixtures");
    versionManager.registerVersion("v1.0.0", ["m1", "m2"], "Initial release");
  });

  it("should load version data correctly", () => {
    const versionData = versionManager.getVersionData("v1.0.0");
    assert(versionData);
    assert.deepEqual(versionData?.migrations, ["m1", "m2"]);
  });

  it("should get migrations between versions", () => {
    versionManager.registerVersion("v1.1.0", ["m3", "m4"], "Update release");
    const { migrationsToRun } = versionManager.getMigrationsBetween(
      "v1.0.0",
      "v1.1.0",
    );
    assert.deepEqual(migrationsToRun, ["m3", "m4"]);
  });

  it("should generate a deployment plan", () => {
    const plan = versionManager.generateDeploymentPlan("v1.0.0", "v1.1.0");
    assert(plan.hasOwnProperty("summary"));
    assert(Array.isArray(plan.plan));
  });
});
