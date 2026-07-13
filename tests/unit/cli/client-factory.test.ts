import { describe, expect, mock, test } from "bun:test";
import { createPrismaClient } from "../../../src/cli/client-factory";
import type { PrismaClient } from "../../../src/types";

describe("createPrismaClient", () => {
  test("uses a configured client factory", async () => {
    const client: PrismaClient = {
      $executeRaw: mock(() => Promise.resolve(0)),
      $executeRawUnsafe: mock(() => Promise.resolve(0)),
      $queryRaw: mock(() => Promise.resolve([])),
      $transaction: mock((operation) => operation(client)),
      $disconnect: mock(() => Promise.resolve()),
    };
    const factory = () => Promise.resolve(client);

    await expect(createPrismaClient(factory)).resolves.toBe(client);
  });
});
