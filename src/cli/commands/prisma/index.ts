import { spawn } from "child_process";
import { colors } from "../../../utils/colors";

export async function execPrismaCommand(
  command: string,
  args: string[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(colors.cyan(`\nRunning: prisma ${command} ${args.join(" ")}\n`));

    const prisma = spawn("npx", ["prisma", command, ...args], {
      stdio: "inherit",
    });

    prisma.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Prisma command exited with code ${code}`));
      }
    });

    prisma.on("error", (error) => {
      reject(error);
    });
  });
}

export async function dev(name?: string) {
  const args = ["dev"];
  if (name) {
    args.push("--name", name);
  }
  await execPrismaCommand("migrate", args);
}

export async function deploy() {
  await execPrismaCommand("migrate", ["deploy"]);
}

export async function resolve(options: {
  applied?: string;
  rolledBack?: string;
}) {
  const args = ["resolve"];
  if (options.applied) {
    args.push("--applied", options.applied);
  }
  if (options.rolledBack) {
    args.push("--rolled-back", options.rolledBack);
  }
  await execPrismaCommand("migrate", args);
}

export async function dbPush(options: { skipGenerate?: boolean } = {}) {
  const args = ["push"];
  if (options.skipGenerate) {
    args.push("--skip-generate");
  }
  await execPrismaCommand("db", args);
}

export async function generate() {
  await execPrismaCommand("generate", []);
}
