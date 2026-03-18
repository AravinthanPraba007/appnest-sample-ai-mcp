import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { Readable } from "stream";
import { z } from "zod";

const APPNEST_TOOLS_ZIP_URL =
  "https://github.com/AravinthanPraba007/appnest-sample-tools/archive/refs/heads/main.zip";
const APPNEST_TOOLS_FOLDER = "appnest-tools";

async function findToolsZipRoot(tempExtractDir) {
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

export const setupAppnestToolsToolName = "setup_appnest_tools";
export const setupAppnestToolsToolDescription = `
Creates or refreshes the appnest-tools folder in the project with the latest Appnest sample tools (governance, PRD generator, etc.).
If appnest-tools exists, all contents are removed first. Then the zip from the official repo is downloaded and extracted so all files are at the top of appnest-tools.
Pass projectRoot (absolute path to the project directory) so the folder is created in the correct project; if omitted, the server's current working directory is used (which may not be your project).
`;
export const setupAppnestToolsToolSchema = {
  projectRoot: z.string().optional(),
};

export async function setupAppnestToolsToolCallback({ projectRoot: projectRootArg } = {}) {
  const projectRoot = projectRootArg ? path.resolve(projectRootArg) : process.cwd();
  const appnestToolsDir = path.join(projectRoot, APPNEST_TOOLS_FOLDER);

  try {
    // 1. Create appnest-tools folder if not present
    await fs.promises.mkdir(appnestToolsDir, { recursive: true });

    // 2. Delete all files and subdirectories inside appnest-tools
    const entries = await fs.promises.readdir(appnestToolsDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(appnestToolsDir, entry.name);
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    }

    // 3. Download zip
    const res = await fetch(APPNEST_TOOLS_ZIP_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

    const zipPath = path.join(projectRoot, "appnest-tools-download.zip");
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

    // 4. Extract zip to a temp folder (sibling to appnest-tools so we can move contents)
    const tempExtractDir = path.join(projectRoot, ".appnest-tools-extract-temp");
    await fs.promises.mkdir(tempExtractDir, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempExtractDir, true);

    const extractedRoot = await findToolsZipRoot(tempExtractDir);
    if (!extractedRoot || !fs.existsSync(extractedRoot)) {
      const listed = await fs.promises.readdir(tempExtractDir).catch(() => []);
      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
      await fs.promises.rm(zipPath, { force: true });
      throw new Error(
        `Extraction failed: no tools folder in zip. Found: ${listed.join(", ") || "(empty)"}`
      );
    }

    // 5. Move all contents from extractedRoot into appnest-tools
    const innerEntries = await fs.promises.readdir(extractedRoot, { withFileTypes: true });
    for (const entry of innerEntries) {
      const from = path.join(extractedRoot, entry.name);
      const to = path.join(appnestToolsDir, entry.name);
      await fs.promises.rename(from, to);
    }

    // 6. Cleanup temp folder and zip
    await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    await fs.promises.rm(zipPath, { force: true });

    const absolutePath = path.resolve(appnestToolsDir);
    return {
      content: [
        {
          type: "text",
          text: `✅ Appnest tools updated at:\n${absolutePath}\n\nContents from ${APPNEST_TOOLS_ZIP_URL} have been extracted to the top of the appnest-tools folder.`,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to setup appnest-tools:\n${message}`,
        },
      ],
    };
  }
}
