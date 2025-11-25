import { Migrations } from "../../../migrations";
import type { PrismaClient } from "../../../types";
import { logger } from "../../../logger";
import { colors } from "../../../utils/colors";
import { Prompt } from "../../../utils/prompts";

const checkIfLockExists = async (
  migrations: Migrations,
): Promise<boolean> => {
  const isLocked = await migrations.checkLockStatus();
  const noLockToRelease = !isLocked;

  if (noLockToRelease) {
    logger.info(`${colors.green("✓")} No migration lock to release`);
    return false;
  }

  return true;
};

const confirmLockRelease = async (force: boolean): Promise<boolean> => {
  const shouldSkipConfirmation = force;

  if (shouldSkipConfirmation) {
    return true;
  }

  const prompt = new Prompt();
  const confirmed = await prompt.confirm(
    "Force release migration lock? This could cause issues if a migration is actually running.",
    false,
  );
  prompt.close();

  return confirmed;
};

export const releaseLock = async (
  prisma: PrismaClient,
  force: boolean = false,
): Promise<number> => {
  const migrations = new Migrations(prisma);

  const lockExists = await checkIfLockExists(migrations);
  const noLockFound = !lockExists;

  if (noLockFound) {
    return 0;
  }

  const confirmed = await confirmLockRelease(force);
  const userCancelled = !confirmed;

  if (userCancelled) {
    logger.info("Lock release cancelled");
    return 1;
  }

  await migrations.releaseLock();

  logger.info(`${colors.green("✓")} Migration lock released`);
  return 0;
};
