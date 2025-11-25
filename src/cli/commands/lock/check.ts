import { Migrations } from "../../../migrations";
import type { PrismaClient } from "../../../types";
import { logger } from "../../../logger";
import { colors } from "../../../utils/colors";

export const checkLock = async (prisma: PrismaClient): Promise<number> => {
  const migrations = new Migrations(prisma);

  const isLocked = await migrations.checkLockStatus();

  if (isLocked) {
    logger.info(`${colors.yellow("⚠")} Migration lock is currently held`);
    logger.info("");
    logger.info("This means:");
    logger.info("  • Another migration process may be running");
    logger.info("  • A previous migration process may have crashed");
    logger.info("");
    logger.info("To release the lock:");
    logger.info(`  ${colors.cyan("npx prisma-migrations lock release")}`);
    return 1;
  }

  logger.info(`${colors.green("✓")} No migration lock held`);
  return 0;
};
