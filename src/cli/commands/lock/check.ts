import { Migrations } from "../../../migrations";
import type { MigrationsOptions } from "../../../migrations";
import type { PrismaClient } from "../../../types";
import { colors } from "../../../utils/colors";

export const checkLock = async (
  prisma: PrismaClient,
  options: MigrationsOptions = {},
): Promise<number> => {
  const migrations = new Migrations(prisma, options);

  const isLocked = await migrations.checkLockStatus();

  if (isLocked) {
    console.log(colors.yellow("[!] Migration lock is currently held"));
    console.log(colors.cyan("Run: prisma-migrations lock release --force"));
    return 1;
  }

  console.log(colors.green("[x] No migration lock held"));
  return 0;
};
