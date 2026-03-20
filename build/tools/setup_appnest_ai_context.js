import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { Readable } from "stream";
import { z } from "zod";

const APPNEST_AI_CONTEXT_ZIP_URL =
  "https://github.com/AravinthanPraba007/appnest-sample-tools/archive/refs/heads/main.zip";
/** Project folder where sample AI context / tools content is placed (was appnest-tools). */
const APPNEST_AI_CONTEXT_FOLDER = "appnest-ai-context";

async function findZipExtractedRoot(tempExtractDir) {
  const names = await fs.promises.readdir(tempExtractDir);
  const dirs = [];
  for (const n of names) {
    const p = path.join(tempExtractDir, n);
    try {
      if ((await fs.promises.stat(p)).isDirectory()) dirs.push(n);
    } catch {
      /* ignore */
    }
  }
  const preferred = dirs.find(
    (d) => d.includes("appnest-sample-tools") || d.includes("appnest-tools")
  );
  const chosen = preferred || dirs.find((d) => d.endsWith("-main")) || dirs[0];
  return chosen ? path.join(tempExtractDir, chosen) : null;
}

export const setupAppnestAiContextToolName = "setup_appnest_ai_context";

export const setupAppnestAiContextToolDescription = `
Sets up the latest Appnest AI context pack in **appnest-ai-context/** (governance, PRD generator, etc.—content from the official sample-tools zip).

If **appnest-ai-context** already exists in the project, it is **removed entirely** first, then the zip is downloaded and extracted so files land at the top of a fresh folder.

Pass **projectRoot** (absolute path) so the folder is created in the right project; if omitted, the MCP server's current working directory is used.
`;

export const setupAppnestAiContextToolSchema = {
  projectRoot: z.string().optional(),
};

export async function setupAppnestAiContextToolCallback({ projectRoot: projectRootArg } = {}) {
  const projectRoot = projectRootArg ? path.resolve(projectRootArg) : process.cwd();
  const contextDir = path.join(projectRoot, APPNEST_AI_CONTEXT_FOLDER);
  const tempExtractDir = path.join(projectRoot, ".appnest-ai-context-extract-temp");

  try {
    if (fs.existsSync(contextDir)) {
      await fs.promises.rm(contextDir, { recursive: true, force: true });
    }

    if (fs.existsSync(tempExtractDir)) {
      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    }

    await fs.promises.mkdir(contextDir, { recursive: true });

    const res = await fetch(APPNEST_AI_CONTEXT_ZIP_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

    const zipPath = path.join(projectRoot, "appnest-ai-context-download.zip");
    const fileStream = fs.createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
      if (res.body) {
        const nodeStream = Readable.fromWeb(res.body);
        nodeStream.on("error", reject);
        fileStream.on("error", reject);
        fileStream.on("finish", resolve);
        nodeStream.pipe(fileStream);
      } else {
        reject(new Error("No response body"));
      }
    });

    await fs.promises.mkdir(tempExtractDir, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempExtractDir, true);

    const extractedRoot = await findZipExtractedRoot(tempExtractDir);
    if (!extractedRoot || !fs.existsSync(extractedRoot)) {
      const listed = await fs.promises.readdir(tempExtractDir).catch(() => []);
      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
      await fs.promises.rm(zipPath, { force: true });
      throw new Error(
        `Extraction failed: no folder in zip. Found: ${listed.join(", ") || "(empty)"}`
      );
    }

    const innerEntries = await fs.promises.readdir(extractedRoot, { withFileTypes: true });
    for (const entry of innerEntries) {
      const from = path.join(extractedRoot, entry.name);
      const to = path.join(contextDir, entry.name);
      await fs.promises.rename(from, to);
    }

    await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    await fs.promises.rm(zipPath, { force: true });

    const absolutePath = path.resolve(contextDir);
    return {
      content: [
        {
          type: "text",
          text: `✅ Appnest AI context set up at:\n${absolutePath}\n\nContents from ${APPNEST_AI_CONTEXT_ZIP_URL} are at the top of appnest-ai-context/.`,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to set up appnest-ai-context:\n${message}`,
        },
      ],
    };
  }
}
