import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { Prompt, createPrompt } from "../../../src/utils/prompts";
import * as readline from "readline";

describe("Prompt", () => {
  let mockRl: any;
  let createInterfaceSpy: any;

  beforeEach(() => {
    mockRl = {
      question: mock(),
      close: mock(),
    };

    createInterfaceSpy = spyOn(readline, "createInterface").mockReturnValue(
      mockRl as any,
    );
  });

  afterEach(() => {
    createInterfaceSpy.mockRestore();
  });

  describe("constructor", () => {
    test("should create readline interface", () => {
      new Prompt();
      expect(readline.createInterface).toHaveBeenCalled();
    });
  });

  describe("close", () => {
    test("should close readline interface", () => {
      const prompt = new Prompt();
      prompt.close();
      expect(mockRl.close).toHaveBeenCalled();
    });
  });

  describe("input", () => {
    test("should prompt for input and return value", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("test-value");
      });

      const prompt = new Prompt();
      const result = await prompt.input("Enter name:");

      expect(result).toBe("test-value");
      expect(mockRl.question).toHaveBeenCalledWith(
        "Enter name:: ",
        expect.any(Function),
      );
    });

    test("should return default value when input is empty", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      const result = await prompt.input("Enter name:", "default");

      expect(result).toBe("default");
    });

    test("should show default value in prompt", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      await prompt.input("Enter name:", "default-value");

      expect(mockRl.question).toHaveBeenCalledWith(
        "Enter name: (default-value): ",
        expect.any(Function),
      );
    });

    test("should validate input and re-prompt on failure", async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback("bad");
        } else {
          callback("good");
        }
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => {
        logs.push(args.join(" "));
      };

      const prompt = new Prompt();
      const result = await prompt.input("Enter value:", undefined, (input) => {
        if (input === "bad") return "Invalid input";
        return true;
      });

      console.log = originalLog;

      expect(result).toBe("good");
      expect(callCount).toBe(2);
      expect(logs[0]).toContain("Invalid input");
    });

    test("should accept input when validation passes", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("valid");
      });

      const prompt = new Prompt();
      const result = await prompt.input("Enter value:", undefined, (input) => {
        return input === "valid" ? true : "Must be 'valid'";
      });

      expect(result).toBe("valid");
    });
  });

  describe("number", () => {
    test("should prompt for number and return value", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("42");
      });

      const prompt = new Prompt();
      const result = await prompt.number("Enter number:");

      expect(result).toBe(42);
    });

    test("should return default value when input is empty", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      const result = await prompt.number("Enter number:", 10);

      expect(result).toBe(10);
    });

    test("should show default value in prompt", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      await prompt.number("Enter number:", 5);

      expect(mockRl.question).toHaveBeenCalledWith(
        "Enter number: (5): ",
        expect.any(Function),
      );
    });

    test("should re-prompt when input is not a number", async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback("not-a-number");
        } else {
          callback("123");
        }
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => {
        logs.push(args.join(" "));
      };

      const prompt = new Prompt();
      const result = await prompt.number("Enter number:");

      console.log = originalLog;

      expect(result).toBe(123);
      expect(callCount).toBe(2);
      expect(logs[0]).toContain("valid number");
    });

    test("should validate number and re-prompt on failure", async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback("5");
        } else {
          callback("10");
        }
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => {
        logs.push(args.join(" "));
      };

      const prompt = new Prompt();
      const result = await prompt.number("Enter number:", undefined, (num) => {
        if (num === undefined || num < 10) return "Must be at least 10";
        return true;
      });

      console.log = originalLog;

      expect(result).toBe(10);
      expect(callCount).toBe(2);
      expect(logs[0]).toContain("Must be at least 10");
    });
  });

  describe("confirm", () => {
    test("should return true for 'y' input", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("y");
      });

      const prompt = new Prompt();
      const result = await prompt.confirm("Continue?");

      expect(result).toBe(true);
    });

    test("should return true for 'yes' input", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("yes");
      });

      const prompt = new Prompt();
      const result = await prompt.confirm("Continue?");

      expect(result).toBe(true);
    });

    test("should return false for 'n' input", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("n");
      });

      const prompt = new Prompt();
      const result = await prompt.confirm("Continue?");

      expect(result).toBe(false);
    });

    test("should return false for 'no' input", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("no");
      });

      const prompt = new Prompt();
      const result = await prompt.confirm("Continue?");

      expect(result).toBe(false);
    });

    test("should return default value for empty input", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      const result = await prompt.confirm("Continue?", true);

      expect(result).toBe(true);
    });

    test("should show Y/n for default true", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      await prompt.confirm("Continue?", true);

      expect(mockRl.question).toHaveBeenCalledWith(
        "Continue? (Y/n): ",
        expect.any(Function),
      );
    });

    test("should show y/N for default false", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("");
      });

      const prompt = new Prompt();
      await prompt.confirm("Continue?", false);

      expect(mockRl.question).toHaveBeenCalledWith(
        "Continue? (y/N): ",
        expect.any(Function),
      );
    });

    test("should be case insensitive", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("YES");
      });

      const prompt = new Prompt();
      const result = await prompt.confirm("Continue?");

      expect(result).toBe(true);
    });
  });

  describe("list", () => {
    test("should display choices and return selected value", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("2");
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => {
        logs.push(args.join(" "));
      };

      const prompt = new Prompt();
      const result = await prompt.list("Select option:", [
        { name: "Option 1", value: "opt1" },
        { name: "Option 2", value: "opt2" },
        { name: "Option 3", value: "opt3" },
      ]);

      console.log = originalLog;

      expect(result).toBe("opt2");
      expect(logs).toContain("\nSelect option:");
      expect(logs).toContain("  1. Option 1");
      expect(logs).toContain("  2. Option 2");
      expect(logs).toContain("  3. Option 3");
    });

    test("should re-prompt for invalid choice", async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback("99");
        } else {
          callback("1");
        }
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => {
        logs.push(args.join(" "));
      };

      const prompt = new Prompt();
      const result = await prompt.list("Select option:", [
        { name: "Option 1", value: "opt1" },
      ]);

      console.log = originalLog;

      expect(result).toBe("opt1");
      expect(callCount).toBe(2);
      const errorLog = logs.find((log) => log.includes("Invalid choice"));
      expect(errorLog).toBeDefined();
    });

    test("should re-prompt for non-numeric input", async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback("abc");
        } else {
          callback("1");
        }
      });

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => {
        logs.push(args.join(" "));
      };

      const prompt = new Prompt();
      const result = await prompt.list("Select option:", [
        { name: "Option 1", value: "opt1" },
      ]);

      console.log = originalLog;

      expect(result).toBe("opt1");
      expect(callCount).toBe(2);
    });

    test("should handle selecting first option", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("1");
      });

      const prompt = new Prompt();
      const result = await prompt.list("Select option:", [
        { name: "First", value: "first" },
        { name: "Second", value: "second" },
      ]);

      expect(result).toBe("first");
    });

    test("should handle selecting last option", async () => {
      mockRl.question.mockImplementation((_prompt: string, callback: any) => {
        callback("3");
      });

      const prompt = new Prompt();
      const result = await prompt.list("Select option:", [
        { name: "First", value: "first" },
        { name: "Second", value: "second" },
        { name: "Third", value: "third" },
      ]);

      expect(result).toBe("third");
    });
  });
});

describe("createPrompt", () => {
  let mockRl: any;
  let createInterfaceSpy: any;

  beforeEach(() => {
    mockRl = {
      question: mock(),
      close: mock(),
    };

    createInterfaceSpy = spyOn(readline, "createInterface").mockReturnValue(
      mockRl as any,
    );
  });

  afterEach(() => {
    createInterfaceSpy.mockRestore();
  });

  test("should create prompt, execute callback, and close", async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: any) => {
      callback("test");
    });

    const result = await createPrompt(async (prompt) => {
      return await prompt.input("Enter value:");
    });

    expect(result).toBe("test");
    expect(mockRl.close).toHaveBeenCalled();
  });

  test("should close prompt even if callback throws", async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: any) => {
      callback("test");
    });

    try {
      await createPrompt(async () => {
        throw new Error("Test error");
      });
    } catch (error) {
      expect((error as Error).message).toBe("Test error");
    }

    expect(mockRl.close).toHaveBeenCalled();
  });

  test("should return callback result", async () => {
    mockRl.question.mockImplementation((_prompt: string, callback: any) => {
      callback("42");
    });

    const result = await createPrompt(async (prompt) => {
      const num = await prompt.number("Enter number:");
      return num * 2;
    });

    expect(result).toBe(84);
  });
});
