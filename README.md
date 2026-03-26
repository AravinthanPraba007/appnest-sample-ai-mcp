# Appnest App MCP

Model Context Protocol (MCP) server for **Appnest App** projects: scaffold base code, set up AI context, validate runtime prerequisites, and run the `appnest-development-engine` CLI workflows.

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **Node.js** | **22+** (matches `appnest-development-engine` / Appnest app; uses `fetch`, ESM). |
| **MCP client** | Any client that launches MCP over **stdio** (e.g. Cursor MCP config). |
| **`appnest-development-engine`** | On `PATH`, for `run_appnest_command` and for **hi appnest** (precheck, install-packages). Use **`setup_appnest_app_runtime`** to verify Node 22+ and install **`appnest-development-engine`** globally if missing. |
| **Network** | Clone/setup tools download zips from GitHub (`appnest-sample-basecode`, `appnest-sample-tools`). |
| **Project folder** | Run the MCP with **cwd = your Appnest project root**, or pass explicit paths where tools support it. |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `.env` | Loaded via `dotenv` (e.g. future API keys). |

### Cursor / MCP config example

```json
{
  "mcpServers": {
    "appnest-app-mcp": {
      "command": "npx",
      "args": ["-y", "@sparrowengg/appnest-app-mcp"],
      "transport": "stdio"
    }
  }
}
```

Use **`cwd`** so `hi appnest` clones into the intended folder and `appnest-development-engine` runs in the right tree.

#### Why did clone go to a different folder (e.g. `appnest-base`)?

The MCP server only knows two things:

1. **`cwd` in mcp.json** — Node’s `process.cwd()` when tools run. If you omit `targetDir`, clone uses **this** folder.
2. **`targetDir` in the tool call** — Whatever path the model passes. If the assistant picks `/.../appnest-base`, files go there—even if you had **`appnest-sample-apps`** open.

**Fix:** Set **`"cwd"`** in MCP to **`/Users/.../appnest-sample-apps`** (your real project). Then say *“clone the Appnest basecode into this project”* or *“omit targetDir”* so it uses that cwd. Or say explicitly: *“targetDir must be …/appnest-sample-apps”*.

### Checklist for a working run

1. **`npm install`** in this repo (so `@modelcontextprotocol/sdk` and deps resolve).
2. **`build/server.js`** exists and is executable (`npm run build`).
3. MCP **`cwd`** = the Appnest project directory (especially for **hi_appnest**).
4. **`appnest-development-engine`** on `PATH` when using **run_appnest_command** / **hi_appnest** (on Windows, global npm CLIs usually work via the `exec` path used in code).
5. **Network** for clone/setup zips (GitHub).

---

## Tools

| Tool | Purpose |
|------|---------|
| **hi_appnest** | Full onboarding: setup basecode → `setup_appnest_ai_context` → precheck → install-packages. |
| **setup_appnest_app_basecode** | Download & extract official base zip into `targetDir` (default: cwd). Skips if the folder isn’t empty (allowed: `.cursor`, `.DS_Store`, `Thumbs.db`) unless **`force: true`**. |
| **setup_appnest_ai_context** | Replace **`appnest-ai-context/`** (delete if present), then download & extract from the sample tools repo (`appnest-sample-tools` zip). |
| **setup_appnest_app_runtime** | Ensures **Node.js 22+** (on macOS/Linux can install via **nvm** + official install script if MCP is on older Node), global **`appnest-development-engine`**, then **`appnest-development-engine app help`**. Needs network when installing. |
| **run_appnest_command** | Runs `appnest-development-engine app` + subcommand with optional `workingDirectory`. Subcommands: **init**, **precheck**, **install-packages**, **start**, **pack**, **validate**, **ai-context**. Discover: `appnest-development-engine app`, `appnest-development-engine app help`, or `appnest-development-engine app -h`. |

---

## Development

```bash
npm install
npm run build    # ensures server.js is executable
npm run inspect  # MCP Inspector (optional)
```

**Note:** The MCP server and tools live under `build/`, which is **tracked in git** so clones include a runnable server. Run `npm run build` after edits if you change `server.js` shebang/permissions.

---

## License / package

