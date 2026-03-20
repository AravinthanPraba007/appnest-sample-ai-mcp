import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { z } from "zod";

const execAsync = promisify(exec);

const CLI_NAME = "appnest-development-engine";

/** Subcommands after `appnest-development-engine app …` */
export const runAppnestEngineCommandToolName = "run_appnest_command";

export const runAppnestEngineCommandToolDescription = `
Runs \`appnest-development-engine app <command>\` in the given working directory.

Allowed \`command\` values (see also \`appnest-development-engine app help\`):
- **init** — Set up the app project
- **precheck** — Check Node.js (>=22) and paths
- **install-packages** — Install npm packages in all engine packages
- **start** — Start proxy (backend + frontends)
- **pack** — Bundle frontends, then zip app folders into appnest-app-pack
- **validate** — Validate app-backend, app-frontend, and manifest
- **ai-context** — Download AI context to appnest-ai-context/
`;

const ALLOWED_COMMANDS = [
  "init",
  "precheck",
  "install-packages",
  "start",
  "pack",
  "validate",
  "ai-context",
];

export const runAppnestEngineCommandToolSchema = {
  command: z
    .enum([
      "init",
      "precheck",
      "install-packages",
      "start",
      "pack",
      "validate",
      "ai-context",
    ])
    .describe("app subcommand: init | precheck | install-packages | start | pack | validate | ai-context"),
  workingDirectory: z
    .string()
    .optional()
    .describe("Project root where appnest-development-engine should run. Defaults to cwd."),
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
        `${CLI_NAME} app ${command}`,
        { cwd, maxBuffer, env }
      );
      stdout = o ?? "";
      stderr = e ?? "";
    } else {
      const result = await execFile(CLI_NAME, ["app", command], {
        cwd,
        maxBuffer,
        env,
      });
      stdout = result.stdout ?? "";
      stderr = result.stderr ?? "";
    }
    const out =
      [stdout, stderr].filter(Boolean).join("\n") ||
      `(no output) ${CLI_NAME} app ${command}`;
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
