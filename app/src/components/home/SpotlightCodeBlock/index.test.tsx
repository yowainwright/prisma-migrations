import { describe, it, expect } from "bun:test";
import SpotlightCodeBlock from "./index";
import { codeLines, TERMINAL_COLORS } from "./constants";

describe("SpotlightCodeBlock", () => {
  it("exports SpotlightCodeBlock component", () => {
    expect(SpotlightCodeBlock).toBeDefined();
    expect(typeof SpotlightCodeBlock).toBe("function");
  });

  it("exports code lines constants", () => {
    expect(codeLines).toBeDefined();
    expect(Array.isArray(codeLines)).toBe(true);
    expect(codeLines.length).toBeGreaterThan(0);
  });

  it("exports terminal colors constants", () => {
    expect(TERMINAL_COLORS).toBeDefined();
    expect(TERMINAL_COLORS.red).toBe('#FF5F56');
    expect(TERMINAL_COLORS.yellow).toBe('#FFBD2E');
    expect(TERMINAL_COLORS.green).toBe('#27C93F');
  });

  it("code lines contain expected commands", () => {
    const commandContents = codeLines.map(line => line.content);
    const allContent = commandContents.join(" ");

    expect(allContent).toContain("npm install prisma-migrations");
    expect(allContent).toContain("npx prisma-migrations");
  });
});
