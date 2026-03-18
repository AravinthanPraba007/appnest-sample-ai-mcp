import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { z } from "zod";

const execAsync = promisify(exec);

export const runAppnestEngineCommandToolName = "run_appnest_command";

export const runAppnestEngineCommandToolDescription =
  "Run Appnest-engine CLI: precheck | install-packages | run-all | zip-app. Runs in the given working directory.";

const ALLOWED_COMMANDS = ["precheck", "install-packages", "run-all", "zip-app"];

export const runAppnestEngineCommandToolSchema = {
  command: z
    .enum(["precheck", "install-packages", "run-all", "zip-app"])
    .describe("Appnest-engine subcommand"),
  workingDirectory: z
    .string()
    .optional()
    .describe("Project root where appnest-engine should run. Defaults to cwd."),
};

/** MCP uses stdout for JSON-RPC — never use console.log in tools. */
export const runAppnestEngineCommandToolCallback = async ({
  command,
  workingDirectory,
}) => {
  const cwd = workingDirectory ? path.resolve(workingDirectory) : process.cwd();

  if (!ALLOWED_COMMANDS.includes(command)) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Invalid command "${command}". Allowed: ${ALLOWED_COMMANDS.join(", ")}`,
        },
      ],
    };
  }

  const maxBuffer = 10 * 1024 * 1024;
  const env = { ...process.env };

  try {
    let stdout = "";
    let stderr = "";
    if (process.platform === "win32") {
      const { stdout: o, stderr: e } = await execAsync(
        `appnest-engine run ${command}`,
        { cwd, maxBuffer, env }
      );
      stdout = o ?? "";
      stderr = e ?? "";
    } else {
      const result = await execFile("appnest-engine", ["run", command], {
        cwd,
        maxBuffer,
        env,
      });
      stdout = result.stdout ?? "";
      stderr = result.stderr ?? "";
    }
    const out =
      [stdout, stderr].filter(Boolean).join("\n") ||
      `(no output) appnest-engine run ${command}`;
    return {
      content: [
        {
          type: "text",
          text: `${out.trim()}\n\n__MCP_EXIT_CODE__:0`,
        },
      ],
    };
  } catch (err) {
    let exitCode = 1;
    if (err && typeof err === "object" && "code" in err) {
      const c = err.code;
      exitCode = typeof c === "number" ? c : c === "ENOENT" ? 127 : 1;
    }
    const stdout = err?.stdout?.toString?.() ?? "";
    const stderr = err?.stderr?.toString?.() ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    const combined = [stdout, stderr].filter(Boolean).join("\n") || msg;
    return {
      content: [
        {
          type: "text",
          text: `${combined.trim()}\n\n__MCP_EXIT_CODE__:${exitCode}`,
        },
      ],
    };
  }
};
