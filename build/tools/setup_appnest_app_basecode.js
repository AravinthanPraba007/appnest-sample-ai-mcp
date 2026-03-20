import { z } from "zod";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { Readable } from "stream";

export const setupAppnestAppBasecodeToolName = "setup_appnest_app_basecode";

export const setupAppnestAppBasecodeToolDescription = `
Downloads and extracts the official Appnest basecode (GitHub zip) into a folder.

IMPORTANT for the assistant:
- If the user wants the app in their **current / open project**, set targetDir to that folder path (the same path as MCP "cwd" if that is their project), OR omit targetDir so files go into MCP cwd.
- Do NOT invent a different folder (e.g. a sibling like appnest-base) unless the user explicitly asked for that path or a new folder by name.
- Setup runs only when the target folder is empty except for **.cursor** (and harmless files like .DS_Store). Otherwise the tool **skips** unless the user explicitly asks for **force: true** (may collide with existing files).
`;

export const setupAppnestAppBasecodeToolSchema = {
  targetDir: z
    .string()
    .optional()
    .describe(
      "Project root where basecode files should land. Use the user's Appnest project path when they want it there. Omit to use MCP server cwd (set in Cursor mcp.json)."
    ),
  projectType: z.string().optional(),
  force: z
    .boolean()
    .optional()
    .describe(
      "If true, extract even when the folder is not empty (risk of collisions). Default false: skip when anything exists besides .cursor / OS junk."
    ),
};

/** Names allowed in targetDir before setup (empty project or post–hi_appnest .cursor only). */
const ALLOWED_PRE_SETUP_NAMES = new Set([".cursor", ".DS_Store", "Thumbs.db"]);

async function listBlockingEntries(targetDir) {
  let names;
  try {
    names = await fs.promises.readdir(targetDir);
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  return names.filter((n) => !ALLOWED_PRE_SETUP_NAMES.has(n));
}

async function findExtractedProjectFolder(targetDir, zipBaseName) {
  const names = await fs.promises.readdir(targetDir);
  const dirs = [];
  for (const n of names) {
    if (n === zipBaseName) continue;
    const p = path.join(targetDir, n);
    try {
      if ((await fs.promises.stat(p)).isDirectory()) dirs.push(n);
    } catch {
      /* ignore */
    }
  }
  const preferred = dirs.find(
    (d) =>
      d.includes("appnest-sample-basecode") ||
      d.includes("appnest-basecode") ||
      d.endsWith("-main")
  );
  const chosen = preferred || dirs[0];
  return chosen ? path.join(targetDir, chosen) : null;
}

export async function setupAppnestAppBasecodeToolCallback(
  { targetDir: targetDirArg, projectType, force },
  extra = {}
) {
  const sendEvent = typeof extra.sendEvent === "function" ? extra.sendEvent : null;
  try {
    const invalid = ["react", "express", "next", "node", "flutter", "vue", "svelte"];
    if (projectType && invalid.some((t) => projectType.toLowerCase().includes(t))) {
      return {
        content: [{ type: "text", text: `❌ Unsupported project type: ${projectType}` }],
      };
    }

    const targetDir = path.resolve(targetDirArg || process.cwd());
    const repoUrl =
      "https://github.com/AravinthanPraba007/appnest-sample-basecode/archive/refs/heads/main.zip";

    const zipName = "appnest.zip";
    const zipPath = path.join(targetDir, zipName);

    await fs.promises.mkdir(targetDir, { recursive: true });

    const blocking = await listBlockingEntries(targetDir);
    if (blocking.length > 0 && !force) {
      return {
        content: [
          {
            type: "text",
            text:
              `⏭️ Skipped setup: folder is not empty (only .cursor and a few OS files are allowed before a fresh basecode setup).\n` +
              `Found: ${blocking.join(", ")}\n\n` +
              `Use an empty project folder, move/remove those items, or set **force: true** if you intentionally want to set up basecode in this directory (existing files may conflict).`,
          },
        ],
      };
    }

    const res = await fetch(repoUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

    const fileStream = fs.createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
      if (!res.body) {
        reject(new Error("No response body"));
        return;
      }
      const nodeStream = Readable.fromWeb(res.body);
      nodeStream.on("error", reject);
      fileStream.on("error", reject);
      fileStream.on("finish", resolve);
      nodeStream.pipe(fileStream);
    });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);

    const extractedDir = await findExtractedProjectFolder(targetDir, zipName);
    if (!extractedDir || !fs.existsSync(extractedDir)) {
      const files = await fs.promises.readdir(targetDir);
      throw new Error(
        `Extraction failed: could not find extracted app folder. Contents: ${files.join(", ")}`
      );
    }

    const entries = await fs.promises.readdir(extractedDir);
    for (const file of entries) {
      const from = path.join(extractedDir, file);
      const to = path.join(targetDir, file);
      await fs.promises.rename(from, to);
    }

    await fs.promises.rm(extractedDir, { recursive: true, force: true });
    await fs.promises.rm(zipPath, { force: true });

    return {
      content: [
        {
          type: "text",
          text: `✅ Appnest project created at:\n${targetDir}`,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      sendEvent?.({
        type: "event",
        name: "error",
        data: { message },
      });
    } catch {
      /* ignore */
    }
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to create Appnest app:\n${message}`,
        },
      ],
    };
  }
}
