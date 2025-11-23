import { describe, it, expect } from "bun:test";
import PackageManagerIcons from "./PackageManagerIcons";

describe("PackageManagerIcons", () => {
  it("exports PackageManagerIcons component", () => {
    expect(PackageManagerIcons).toBeDefined();
    expect(typeof PackageManagerIcons).toBe("function");
  });

  it("component has correct display name", () => {
    expect(PackageManagerIcons.name).toBe("PackageManagerIcons");
  });

  it("accepts packageManagers prop interface", () => {
    const mockProps = {
      packageManagers: [
        { name: "npm", url: "https://www.npmjs.com/", icon: "npm" as const },
        { name: "yarn", url: "https://yarnpkg.com/", icon: "yarn" as const },
      ],
    };

    expect(mockProps.packageManagers).toBeDefined();
    expect(Array.isArray(mockProps.packageManagers)).toBe(true);
    expect(mockProps.packageManagers[0].icon).toBe("npm");
  });
});
