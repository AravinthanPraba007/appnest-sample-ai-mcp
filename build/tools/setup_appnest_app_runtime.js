import { execFile, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export const setupAppnestAppRuntimeToolName = "setup_appnest_app_runtime";

export const setupAppnestAppRuntimeToolDescription = `
Ensures the Appnest CLI runtime is ready: **Node.js 22+**, global **@sparrowengg/appnest-development-engine**, and a quick **appnest-development-engine app help** smoke test.

On **macOS / Linux**, if this MCP process is older than Node 22, the tool runs **nvm** (installs nvm via the official install script if missing, then \`nvm install 22\` / default alias) and runs npm + \`appnest-development-engine\` **inside a bash subshell** that uses Node 22. The MCP server process itself stays on its current Node until you restart the client with Node 22 on PATH.

On **Windows**, nvm is not used here — install Node 22+ manually and restart the MCP client.

Requires **network** when nvm or npm global install runs.
`;

export const setupAppnestAppRuntimeToolSchema = {};

const ENGINE_PACKAGE = "@sparrowengg/appnest-development-engine";
const CLI_NAME = "appnest-development-engine";
const REQUIRED_NODE_MAJOR = 22;
const NVM_VERSION = "v0.39.7";

/** Same flow as your bash script: install nvm if needed, then Node 22 as default. */
const NVM_INSTALL_SCRIPT = `set -e

NODE_VERSION="22"
NVM_VERSION="v0.39.7"
NVM_DIR="$HOME/.nvm"

echo "Checking for nvm..."

# Install nvm if missing
if ! command -v nvm >/dev/null 2>&1; then
  echo "nvm not found. Installing nvm..."

  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh | bash
fi

# Load nvm into the shell
export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
else
  echo "Error: nvm could not be loaded."
  exit 1
fi

echo "Checking Node.js..."

# Check if Node exists
if command -v node >/dev/null 2>&1; then
  CURRENT_NODE=$(node -v)
  echo "Node already installed: $CURRENT_NODE"
else
  echo "Node not installed."
fi

# Check if Node 22 is installed in nvm
if ! nvm ls "$NODE_VERSION" | grep -q "v$NODE_VERSION"; then
  echo "Installing Node $NODE_VERSION..."
  nvm install $NODE_VERSION
else
  echo "Node $NODE_VERSION already installed in nvm."
fi

# Set Node 22 as default and use it
nvm alias default $NODE_VERSION
nvm use $NODE_VERSION

echo "Final versions:"
node -v
npm -v
`;

function getNodeMajor() {
  const v = process.versions.node || "";
  const major = parseInt(v.split(".")[0], 10);
  return Number.isFinite(major) ? major : 0;
}

function nodeVersionLine() {
  return `MCP process Node: ${process.version} (versions.node ${process.versions.node})`;
}

function isUnixLike() {
  return process.platform !== "win32";
}

/**
 * Run shell commands after sourcing nvm and selecting Node 22 (or default alias).
 */
async function runWithNvmNode(shellBody) {
  const script = `set -e
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm.sh not found at $NVM_DIR. nvm install step may have failed." >&2
  exit 1
fi
. "$NVM_DIR/nvm.sh"
nvm use ${REQUIRED_NODE_MAJOR} 2>/dev/null || nvm use default
${shellBody}
`;
  return execAsync(script, {
    shell: "/bin/bash",
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env },
  });
}

async function runNvmInstallScript(lines) {
  lines.push("📥 Running nvm setup (install nvm if needed, then Node 22)…");
  try {
    const { stdout, stderr } = await execAsync(NVM_INSTALL_SCRIPT, {
      shell: "/bin/bash",
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env },
    });
    const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
    if (combined) lines.push(combined);
  } catch (err) {
    const stdout = err?.stdout?.toString?.() ?? "";
    const stderr = err?.stderr?.toString?.() ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    const detail = [stdout, stderr].filter(Boolean).join("\n").trim() || msg;
    throw new Error(detail);
  }
}

async function isEngineInstalledGlobally(useNvmShell) {
  try {
    if (useNvmShell) {
      await runWithNvmNode(`npm list -g ${ENGINE_PACKAGE} --depth=0`);
    } else if (process.platform === "win32") {
      await execAsync(`npm list -g ${ENGINE_PACKAGE} --depth=0`, {
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env },
      });
    } else {
      await execFileAsync("npm", ["list", "-g", ENGINE_PACKAGE, "--depth=0"], {
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env },
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function installEngineGlobally(useNvmShell) {
  if (useNvmShell) {
    return runWithNvmNode(`npm install -g ${ENGINE_PACKAGE}`);
  }
  const args = ["install", "-g", ENGINE_PACKAGE];
  if (process.platform === "win32") {
    return execAsync(`npm ${args.join(" ")}`, {
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env },
    });
  }
  return execFileAsync("npm", args, {
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env },
  });
}

async function runEngineSmokeTest(useNvmShell) {
  try {
    if (useNvmShell) {
      const { stdout, stderr } = await runWithNvmNode(`${CLI_NAME} app help`);
      return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
    }
    if (process.platform === "win32") {
      const { stdout, stderr } = await execAsync(`${CLI_NAME} app help`, {
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env },
      });
      return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
    }
    const { stdout, stderr } = await execFileAsync(CLI_NAME, ["app", "help"], {
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env },
    });
    return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (err) {
    const stdout = err?.stdout?.toString?.() ?? "";
    const stderr = err?.stderr?.toString?.() ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, stdout, stderr, message: msg, code: err?.code };
  }
}

export async function setupAppnestAppRuntimeToolCallback() {
  const lines = [];
  const major = getNodeMajor();
  let useNvmShell = false;

  if (major >= REQUIRED_NODE_MAJOR) {
    lines.push(`✅ ${nodeVersionLine()}`);
  } else if (!isUnixLike()) {
    lines.push(`❌ Node.js ${REQUIRED_NODE_MAJOR} or newer is required.`);
    lines.push(nodeVersionLine());
    lines.push(
      `Install Node ${REQUIRED_NODE_MAJOR}+ on Windows (e.g. nodejs.org or nvm-windows), then restart Cursor / your MCP client so this server runs on the new Node.`
    );
    lines.push(`This tool does not run the bash/nvm installer on Windows.`);
    return {
      content: [{ type: "text", text: lines.join("\n\n") }],
    };
  } else {
    lines.push(
      `⚠️ ${nodeVersionLine()} — older than Node ${REQUIRED_NODE_MAJOR}. Running nvm installer script (curl + nvm install ${REQUIRED_NODE_MAJOR})…`
    );
    try {
      await runNvmInstallScript(lines);
      lines.push(`✅ nvm and Node ${REQUIRED_NODE_MAJOR} are installed; npm commands below use this Node via a bash + nvm subshell.`);
      useNvmShell = true;
      lines.push(
        `ℹ️ The MCP server process is still ${process.version}. Restart Cursor later so the MCP server itself starts with Node ${REQUIRED_NODE_MAJOR} (e.g. same shell where \`nvm use ${REQUIRED_NODE_MAJOR}\` applies).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`❌ nvm / Node install failed:\n${msg}`);
      lines.push(`Install Node ${REQUIRED_NODE_MAJOR}+ manually, then restart MCP.`);
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
      };
    }
  }

  let installed = false;
  try {
    installed = await isEngineInstalledGlobally(useNvmShell);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`⚠️ Could not check global ${ENGINE_PACKAGE}: ${msg}`);
    lines.push(`Trying to install anyway…`);
    installed = false;
  }

  if (!installed) {
    lines.push(`📦 ${ENGINE_PACKAGE} not found globally (or check failed). Running: npm install -g ${ENGINE_PACKAGE}`);
    try {
      const { stdout, stderr } = await installEngineGlobally(useNvmShell);
      const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
      if (combined) lines.push(combined);
      lines.push(`✅ npm install -g completed.`);
    } catch (err) {
      const stdout = err?.stdout?.toString?.() ?? "";
      const stderr = err?.stderr?.toString?.() ?? "";
      const msg = err instanceof Error ? err.message : String(err);
      const detail = [stdout, stderr].filter(Boolean).join("\n").trim() || msg;
      lines.push(`❌ Global install failed:\n${detail}`);
      lines.push(`Fix npm permissions / network, or run manually: npm install -g ${ENGINE_PACKAGE}`);
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
      };
    }
  } else {
    lines.push(`✅ ${ENGINE_PACKAGE} is already installed globally.`);
  }

  lines.push(`🔍 Smoke test: \`${CLI_NAME} app help\` (${useNvmShell ? "via nvm Node" : "current process PATH"})`);
  const smoke = await runEngineSmokeTest(useNvmShell);
  const smokeText = [smoke.stdout, smoke.stderr].filter(Boolean).join("\n").trim();
  if (smoke.ok) {
    lines.push(
      smokeText ? smokeText.slice(0, 4000) + (smokeText.length > 4000 ? "\n…(truncated)" : "") : `(no output)`
    );
    lines.push(`✅ ${CLI_NAME} responded successfully.`);
  } else {
    lines.push(smokeText || smoke.message || "Unknown error");
    lines.push(
      `❌ ${CLI_NAME} smoke test failed. If you just installed globals, restart Cursor so PATH picks up npm’s bin directory.`
    );
    return {
      content: [{ type: "text", text: lines.join("\n\n") }],
    };
  }

  return {
    content: [{ type: "text", text: lines.join("\n\n") }],
  };
}
