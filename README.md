# Appnest AI MCP

Model Context Protocol (MCP) server that connects AI clients (Cursor, Claude Desktop, etc.) to **Appnest** workflows: scaffold base code, install tooling, and run the `appnest-engine` CLI.

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **Node.js** | 18+ (uses `fetch`, ESM). |
| **MCP client** | Any client that launches MCP over **stdio** (e.g. Cursor MCP config). |
| **`appnest-engine`** | On `PATH`, for `run_appnest_command` and for **hi appnest** (precheck, install-packages). |
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
    "appnest": {
      "command": "node",
      "args": ["/absolute/path/to/appnest-sample-ai-mcp/build/server.js"],
      "cwd": "/absolute/path/to/your-appnest-project"
    }
  }
}
```

Use **`cwd`** so `hi appnest` clones into the intended folder and `appnest-engine` runs in the right tree.

#### Why did clone go to a different folder (e.g. `appnest-base`)?

The MCP server only knows two things:

1. **`cwd` in mcp.json** — Node’s `process.cwd()` when tools run. If you omit `targetDir`, clone uses **this** folder.
2. **`targetDir` in the tool call** — Whatever path the model passes. If the assistant picks `/.../appnest-base`, files go there—even if you had **`appnest-sample-apps`** open.

**Fix:** Set **`"cwd"`** in MCP to **`/Users/.../appnest-sample-apps`** (your real project). Then say *“clone the Appnest basecode into this project”* or *“omit targetDir”* so it uses that cwd. Or say explicitly: *“targetDir must be …/appnest-sample-apps”*.

### Checklist for a working run

1. **`npm install`** in this repo (so `@modelcontextprotocol/sdk` and deps resolve).
2. **`build/server.js`** exists and is executable (`npm run build`).
3. MCP **`cwd`** = the Appnest project directory (especially for **hi_appnest**).
4. **`appnest-engine`** on `PATH` when using **run_appnest_command** / **hi_appnest** (on Windows, global npm CLIs usually work via the `exec` path used in code).
5. **Network** for clone/setup zips (GitHub).

---

## Tools

| Tool | Purpose |
|------|---------|
| **hi_appnest** | Full onboarding: clone basecode → `setup_appnest_tools` → precheck → install-packages. |
| **clone_appnest_basecode** | Download & extract official base zip into `targetDir` (default: cwd). |
| **setup_appnest_tools** | Refresh `appnest-tools/` from the sample tools repo. |
| **run_appnest_command** | Runs `appnest-engine run <command>` with optional `workingDirectory`. Allowed: `precheck`, `install-packages`, `run-all`, `zip-app`. |

---

## Development

```bash
npm install
npm run build    # ensures server.js is executable
npm run inspect  # MCP Inspector (optional)
```

**Note:** The MCP server and tools live under `build/`, which is **tracked in git** so clones include a runnable server. Run `npm run build` after edits if you change `server.js` shebang/permissions.

---

## Issues found & fixes applied

| Issue | Severity | Fix |
|-------|----------|-----|
| **`console.log` in `run_appnest_command`** | **Critical** | MCP stdio transport uses **stdout** for JSON-RPC. Logging to stdout **breaks** the protocol. Removed; use stderr only if needed. |
| **Wrong zip extract folder name** | **High** | Code expected `appnest-basecode-main` but the repo zip expands to **`appnest-sample-basecode-main`**. Clone failed or behaved randomly. Now resolves the extracted folder dynamically. |
| **`hi_appnest` called clone with `{}`** | **High** | `targetDir` was required; validation failed. `targetDir` is now optional (defaults to cwd); `hi_appnest` passes explicit `projectRoot`. |
| **`run_appnest` schema** | **Medium** | Mixed JSON-Schema-style shape vs Zod (used elsewhere). Normalized to **Zod** + strict allowed commands (**command injection** hardening). |
| **`precheck.exitCode`** | **Medium** | Tool results had no `exitCode`. Precheck failure detection was unreliable. Engine command now appends `__MCP_EXIT_CODE__:<n>` for parsing. |
| **`sendEvent` in clone catch** | **Medium** | MCP callbacks may not provide `sendEvent`; could throw. Now optional (`sendEvent?.(...)`). |
| **`npm run build` / `dev`** | **Medium** | `tsc` + `src/server.ts` were referenced but no `tsconfig` / `src` in tree. Scripts now match the **JS `build/`** layout. |
| **`bin`: `appnest-ai-mcp`** | — | After `npm i -g` or via `npx`, you can run `appnest-ai-mcp` instead of `node build/server.js`. |

### Remaining / architectural notes

1. **`server._registeredTools`** — Private SDK surface for `callTool` chaining; may break on SDK upgrades. Prefer official APIs if the SDK adds tool-to-tool invocation.
2. **Dependencies** — `openai`, `sharp`, `remeda` may be unused by current tools; trim when you confirm.
3. **Non-empty `targetDir`** — Cloning into a folder that already has files can cause rename collisions; prefer empty project roots for first-time setup.
4. **`build/`** — Tracked in the repo so `git clone` includes the MCP server.

---

## License / package

Package name: `@aravinthan_p/appnest-ai-mcp`. Adjust `package.json` metadata as needed for your registry.
