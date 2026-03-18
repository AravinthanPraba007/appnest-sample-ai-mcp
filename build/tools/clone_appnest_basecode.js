import { z } from "zod";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { Readable } from "stream";

export const cloneAppnestBasecodeToolName = "clone_appnest_basecode";

export const cloneAppnestBasecodeToolDescription = `
Downloads and extracts the official Appnest basecode (GitHub zip) into a folder.

IMPORTANT for the assistant:
- If the user wants the app in their **current / open project**, set targetDir to that folder path (the same path as MCP "cwd" if that is their project), OR omit targetDir so files go into MCP cwd.
- Do NOT invent a different folder (e.g. a sibling like appnest-base) unless the user explicitly asked for that path or a new folder by name.
- Prefer an empty targetDir folder to avoid rename collisions with existing files.
`;

export const cloneAppnestBasecodeToolSchema = {
  targetDir: z
    .string()
    .optional()
    .describe(
      "Project root where basecode files should land. Use the user's Appnest project path when they want it there. Omit to use MCP server cwd (set in Cursor mcp.json)."
    ),
  projectType: z.string().optional(),
};

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

export async function cloneAppnestBasecodeToolCallback(
  { targetDir: targetDirArg, projectType },
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
