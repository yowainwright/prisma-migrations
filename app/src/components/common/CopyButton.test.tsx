import { describe, it, expect } from "bun:test";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  it("exports CopyButton component", () => {
    expect(CopyButton).toBeDefined();
    expect(typeof CopyButton).toBe("function");
  });

  it("component has correct display name", () => {
    expect(CopyButton.name).toBe("CopyButton");
  });
});
