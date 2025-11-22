import { describe, test, expect } from "bun:test";
import { colors } from "../../../src/utils/colors";

describe("colors", () => {
  test("reset should wrap string with reset code", () => {
    const result = colors.reset("test");
    expect(result).toContain("test");
  });

  test("bold should wrap string with bold code", () => {
    const result = colors.bold("test");
    expect(result).toContain("test");
    expect(result).toContain("\x1b[1m");
  });

  test("red should wrap string with red code", () => {
    const result = colors.red("error");
    expect(result).toContain("error");
    expect(result).toContain("\x1b[31m");
  });

  test("green should wrap string with green code", () => {
    const result = colors.green("success");
    expect(result).toContain("success");
    expect(result).toContain("\x1b[32m");
  });

  test("yellow should wrap string with yellow code", () => {
    const result = colors.yellow("warning");
    expect(result).toContain("warning");
    expect(result).toContain("\x1b[33m");
  });

  test("blue should wrap string with blue code", () => {
    const result = colors.blue("info");
    expect(result).toContain("info");
    expect(result).toContain("\x1b[34m");
  });

  test("cyan should wrap string with cyan code", () => {
    const result = colors.cyan("info");
    expect(result).toContain("info");
    expect(result).toContain("\x1b[36m");
  });

  test("gray should wrap string with gray code", () => {
    const result = colors.gray("muted");
    expect(result).toContain("muted");
    expect(result).toContain("\x1b[90m");
  });

  test("all colors should end with reset code", () => {
    expect(colors.red("test")).toContain("\x1b[0m");
    expect(colors.green("test")).toContain("\x1b[0m");
    expect(colors.yellow("test")).toContain("\x1b[0m");
    expect(colors.blue("test")).toContain("\x1b[0m");
    expect(colors.cyan("test")).toContain("\x1b[0m");
    expect(colors.gray("test")).toContain("\x1b[0m");
  });

  test("colors can be nested", () => {
    const result = colors.bold(colors.red("important"));
    expect(result).toContain("important");
  });
});
