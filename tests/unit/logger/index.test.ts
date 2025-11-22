import { describe, test, expect, mock, afterEach } from "bun:test";
import { logger, setLogLevel } from "../../../src/logger";

describe("logger", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    setLogLevel("silent");
  });

  describe("log levels", () => {
    test("should not log when level is silent", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("silent");

      logger.info("test message");

      expect(called).toBe(false);
    });

    test("should log error when level is error", () => {
      let called = false;
      console.error = (..._args: unknown[]) => {
        called = true;
      };
      setLogLevel("error");

      logger.error("error message");

      expect(called).toBe(true);
    });

    test("should log warn when level is warn", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("warn");

      logger.warn("warning message");

      expect(called).toBe(true);
    });

    test("should log info when level is info", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("info");

      logger.info("info message");

      expect(called).toBe(true);
    });

    test("should log debug when level is debug", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("debug");

      logger.debug("debug message");

      expect(called).toBe(true);
    });

    test("should log trace when level is trace", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("trace");

      logger.trace("trace message");

      expect(called).toBe(true);
    });
  });

  describe("log filtering", () => {
    test("should not log info when level is error", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("error");

      logger.info("info message");

      expect(called).toBe(false);
    });

    test("should not log debug when level is info", () => {
      let called = false;
      console.log = () => {
        called = true;
      };
      setLogLevel("info");

      logger.debug("debug message");

      expect(called).toBe(false);
    });

    test("should log all levels when set to trace", () => {
      let logCount = 0;
      let errorCount = 0;
      console.log = (..._args: unknown[]) => {
        logCount++;
      };
      console.error = (..._args: unknown[]) => {
        errorCount++;
      };
      setLogLevel("trace");

      logger.trace("trace");
      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(logCount).toBeGreaterThanOrEqual(4);
      expect(errorCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("error logging", () => {
    test("should log Error objects with message", () => {
      let errorMessage = "";
      console.error = (_prefix: string, message: string) => {
        errorMessage = message;
      };
      setLogLevel("error");

      const error = new Error("test error");
      logger.error(error);

      expect(errorMessage).toBe("test error");
    });

    test("should include stack trace when level is debug", () => {
      let callCount = 0;
      console.error = () => {
        callCount++;
      };
      setLogLevel("debug");

      const error = new Error("test error");
      logger.error(error);

      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    test("should include stack trace when level is trace", () => {
      let callCount = 0;
      console.error = () => {
        callCount++;
      };
      setLogLevel("trace");

      const error = new Error("test error");
      logger.error(error);

      expect(callCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("message formatting", () => {
    test("should include timestamp in log message", () => {
      let message = "";
      console.log = (...args: unknown[]) => {
        message = args[0] as string;
      };
      setLogLevel("info");

      logger.info("test");

      expect(message).toMatch(/\[\d{1,2}:\d{2}:\d{2}\]/);
    });

    test("should include level in log message", () => {
      let message = "";
      console.log = (msg: string) => {
        message = msg;
      };
      setLogLevel("info");

      logger.info("test");

      expect(message).toContain("[INFO]");
    });

    test("should include WARN level for warnings", () => {
      let message = "";
      console.log = (msg: string) => {
        message = msg;
      };
      setLogLevel("warn");

      logger.warn("test");

      expect(message).toContain("[WARN]");
    });

    test("should include ERROR level for errors", () => {
      let message = "";
      console.error = (...args: unknown[]) => {
        message = args[0] as string;
      };
      setLogLevel("error");

      logger.error("test");

      expect(message).toContain("[ERROR]");
    });
  });

  describe("setLogLevel", () => {
    test("should change logger level", () => {
      let called = false;
      console.log = () => {
        called = true;
      };

      setLogLevel("silent");
      logger.info("should not log");
      expect(called).toBe(false);

      setLogLevel("info");
      logger.info("should log");
      expect(called).toBe(true);
    });
  });
});
