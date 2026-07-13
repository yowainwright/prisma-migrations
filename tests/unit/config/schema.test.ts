import { describe, expect, test } from "bun:test";
import { validateConfig } from "../../../src/config/schema";

describe("validateConfig", () => {
  test("accepts supported configuration", () => {
    const clientFactory = () => Promise.resolve({});
    const config = validateConfig({
      migrationsDir: "./database/migrations",
      disableLocking: true,
      skipChecksumValidation: true,
      lockTimeout: 1000,
      lockLeaseDuration: 5000,
      logLevel: "debug",
      clientFactory,
      hooks: { beforeUp: () => undefined },
    });

    expect(config.migrationsDir).toBe("./database/migrations");
    expect(config.lockLeaseDuration).toBe(5000);
    expect(config.clientFactory).toBe(clientFactory);
  });

  test("rejects non-object configuration", () => {
    expect(() => validateConfig("invalid")).toThrow(
      "Configuration must be an object",
    );
  });

  test("rejects unknown options", () => {
    expect(() => validateConfig({ lockTimout: 1000 })).toThrow(
      'Unknown configuration option "lockTimout"',
    );
  });

  test("rejects invalid option values", () => {
    expect(() => validateConfig({ lockTimeout: 0 })).toThrow(
      'Configuration option "lockTimeout" must be a positive integer',
    );
  });

  test("rejects unknown hooks", () => {
    const config = { hooks: { afterDeploy: () => undefined } };
    expect(() => validateConfig(config)).toThrow('Unknown hook "afterDeploy"');
  });
});
