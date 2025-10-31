import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function mcp() {
  const serverPath = join(__dirname, "../../../mcp/server.js");

  const serverProcess = spawn("node", [serverPath], {
    stdio: "inherit",
  });

  serverProcess.on("error", (error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  });

  serverProcess.on("exit", (code) => {
    process.exit(code || 0);
  });

  process.on("SIGINT", () => {
    serverProcess.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    serverProcess.kill("SIGTERM");
  });
}
