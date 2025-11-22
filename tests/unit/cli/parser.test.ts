import { describe, test, expect, spyOn, afterEach } from "bun:test";
import { parseArgs, showHelp, showVersion } from "../../../src/cli/parser";

describe("parseArgs", () => {
  describe("commands", () => {
    test("should parse init command", () => {
      const result = parseArgs(["node", "cli.js", "init"]);
      expect(result.command).toBe("init");
      expect(result.args).toEqual([]);
    });

    test("should parse create command with name argument", () => {
      const result = parseArgs(["node", "cli.js", "create", "add_users"]);
      expect(result.command).toBe("create");
      expect(result.args).toEqual(["add_users"]);
    });

    test("should parse up command", () => {
      const result = parseArgs(["node", "cli.js", "up"]);
      expect(result.command).toBe("up");
    });

    test("should parse down command", () => {
      const result = parseArgs(["node", "cli.js", "down"]);
      expect(result.command).toBe("down");
    });

    test("should parse status command", () => {
      const result = parseArgs(["node", "cli.js", "status"]);
      expect(result.command).toBe("status");
    });

    test("should parse pending command", () => {
      const result = parseArgs(["node", "cli.js", "pending"]);
      expect(result.command).toBe("pending");
    });

    test("should parse applied command", () => {
      const result = parseArgs(["node", "cli.js", "applied"]);
      expect(result.command).toBe("applied");
    });

    test("should parse latest command", () => {
      const result = parseArgs(["node", "cli.js", "latest"]);
      expect(result.command).toBe("latest");
    });

    test("should parse reset command", () => {
      const result = parseArgs(["node", "cli.js", "reset"]);
      expect(result.command).toBe("reset");
    });

    test("should parse fresh command", () => {
      const result = parseArgs(["node", "cli.js", "fresh"]);
      expect(result.command).toBe("fresh");
    });

    test("should parse refresh command", () => {
      const result = parseArgs(["node", "cli.js", "refresh"]);
      expect(result.command).toBe("refresh");
    });

    test("should parse setup-source command", () => {
      const result = parseArgs(["node", "cli.js", "setup-source"]);
      expect(result.command).toBe("setup-source");
    });

    test("should parse link-types command with argument", () => {
      const result = parseArgs(["node", "cli.js", "link-types", "@my/package"]);
      expect(result.command).toBe("link-types");
      expect(result.args).toEqual(["@my/package"]);
    });

    test("should parse validate command", () => {
      const result = parseArgs(["node", "cli.js", "validate"]);
      expect(result.command).toBe("validate");
    });

    test("should parse dev command", () => {
      const result = parseArgs(["node", "cli.js", "dev"]);
      expect(result.command).toBe("dev");
    });

    test("should parse deploy command", () => {
      const result = parseArgs(["node", "cli.js", "deploy"]);
      expect(result.command).toBe("deploy");
    });

    test("should parse resolve command", () => {
      const result = parseArgs(["node", "cli.js", "resolve"]);
      expect(result.command).toBe("resolve");
    });

    test("should parse push command", () => {
      const result = parseArgs(["node", "cli.js", "push"]);
      expect(result.command).toBe("push");
    });

    test("should parse generate command", () => {
      const result = parseArgs(["node", "cli.js", "generate"]);
      expect(result.command).toBe("generate");
    });
  });

  describe("global options", () => {
    test("should parse --help flag", () => {
      const result = parseArgs(["node", "cli.js", "--help"]);
      expect(result.options.help).toBe(true);
    });

    test("should parse -h flag", () => {
      const result = parseArgs(["node", "cli.js", "-h"]);
      expect(result.options.help).toBe(true);
    });

    test("should parse --version flag", () => {
      const result = parseArgs(["node", "cli.js", "--version"]);
      expect(result.options.version).toBe(true);
    });

    test("should parse --verbose flag", () => {
      const result = parseArgs(["node", "cli.js", "up", "--verbose"]);
      expect(result.options.verbose).toBe(true);
    });

    test("should parse -v flag", () => {
      const result = parseArgs(["node", "cli.js", "up", "-v"]);
      expect(result.options.verbose).toBe(true);
    });

    test("should parse --log-level with value", () => {
      const result = parseArgs([
        "node",
        "cli.js",
        "up",
        "--log-level",
        "debug",
      ]);
      expect(result.options.logLevel).toBe("debug");
    });
  });

  describe("command-specific options", () => {
    test("should parse --dry-run flag for up command", () => {
      const result = parseArgs(["node", "cli.js", "up", "--dry-run"]);
      expect(result.command).toBe("up");
      expect(result.options.dryRun).toBe(true);
    });

    test("should parse --interactive flag", () => {
      const result = parseArgs(["node", "cli.js", "up", "--interactive"]);
      expect(result.options.interactive).toBe(true);
    });

    test("should parse -i flag", () => {
      const result = parseArgs(["node", "cli.js", "up", "-i"]);
      expect(result.options.interactive).toBe(true);
    });

    test("should parse --steps with value", () => {
      const result = parseArgs(["node", "cli.js", "up", "--steps", "3"]);
      expect(result.options.steps).toBe("3");
    });

    test("should parse -s with value", () => {
      const result = parseArgs(["node", "cli.js", "down", "-s", "2"]);
      expect(result.options.steps).toBe("2");
    });

    test("should parse --force flag", () => {
      const result = parseArgs(["node", "cli.js", "reset", "--force"]);
      expect(result.options.force).toBe(true);
    });

    test("should parse -f flag", () => {
      const result = parseArgs(["node", "cli.js", "reset", "-f"]);
      expect(result.options.force).toBe(true);
    });

    test("should parse --source flag", () => {
      const result = parseArgs(["node", "cli.js", "validate", "--source"]);
      expect(result.options.source).toBe(true);
    });

    test("should parse --check with value", () => {
      const result = parseArgs([
        "node",
        "cli.js",
        "validate",
        "--check",
        "my-package",
      ]);
      expect(result.options.check).toBe("my-package");
    });

    test("should parse --skip-generate flag", () => {
      const result = parseArgs(["node", "cli.js", "push", "--skip-generate"]);
      expect(result.options.skipGenerate).toBe(true);
    });

    test("should parse --applied with value", () => {
      const result = parseArgs([
        "node",
        "cli.js",
        "resolve",
        "--applied",
        "20240101000000_test",
      ]);
      expect(result.options.applied).toBe("20240101000000_test");
    });

    test("should parse --rolled-back with value", () => {
      const result = parseArgs([
        "node",
        "cli.js",
        "resolve",
        "--rolled-back",
        "20240101000000_test",
      ]);
      expect(result.options.rolledBack).toBe("20240101000000_test");
    });
  });

  describe("combined flags", () => {
    test("should parse multiple short flags combined", () => {
      const result = parseArgs(["node", "cli.js", "up", "-vi"]);
      expect(result.options.verbose).toBe(true);
      expect(result.options.interactive).toBe(true);
    });

    test("should parse multiple flags separately", () => {
      const result = parseArgs([
        "node",
        "cli.js",
        "up",
        "--verbose",
        "--interactive",
        "--steps",
        "5",
      ]);
      expect(result.options.verbose).toBe(true);
      expect(result.options.interactive).toBe(true);
      expect(result.options.steps).toBe("5");
    });

    test("should parse command with argument and options", () => {
      const result = parseArgs([
        "node",
        "cli.js",
        "create",
        "add_users",
        "--verbose",
      ]);
      expect(result.command).toBe("create");
      expect(result.args).toEqual(["add_users"]);
      expect(result.options.verbose).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("should handle no arguments", () => {
      const result = parseArgs(["node", "cli.js"]);
      expect(result.command).toBeUndefined();
      expect(result.args).toEqual([]);
      expect(result.options).toEqual({});
    });

    test("should handle only flags without command", () => {
      const result = parseArgs(["node", "cli.js", "--verbose"]);
      expect(result.command).toBeUndefined();
      expect(result.options.verbose).toBe(true);
    });

    test("should handle unknown flags", () => {
      const result = parseArgs(["node", "cli.js", "up", "--unknown-flag"]);
      expect(result.command).toBe("up");
      expect(result.options["unknown-flag"]).toBe(true);
    });

    test("should handle unknown flags with values", () => {
      const result = parseArgs(["node", "cli.js", "up", "--custom", "value"]);
      expect(result.command).toBe("up");
      expect(result.options.custom).toBe("value");
    });
  });
});

describe("showHelp", () => {
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
  });

  test("should output help text", () => {
    let output = "";
    console.log = (text: string) => {
      output = text;
    };

    showHelp();

    expect(output).toContain("Prisma Migrations");
    expect(output).toContain("USAGE:");
    expect(output).toContain("COMMANDS:");
    expect(output).toContain("init");
    expect(output).toContain("create");
    expect(output).toContain("up");
    expect(output).toContain("down");
    expect(output).toContain("GLOBAL OPTIONS:");
    expect(output).toContain("--verbose");
    expect(output).toContain("--help");
  });
});

describe("showVersion", () => {
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
  });

  test("should output version number", () => {
    let output = "";
    console.log = (text: string) => {
      output = text;
    };

    showVersion();

    expect(output).toBe("1.0.0");
  });
});
