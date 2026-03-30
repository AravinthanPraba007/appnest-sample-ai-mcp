import fs from "fs";
import path from "path";
import { z } from "zod";

/** Matches folder used by setup_appnest_ai_context. */
const APPNEST_AI_CONTEXT_FOLDER = "appnest-ai-context";

const PRD_WORKFLOW_SEGMENTS = ["appnest-prd-generator", "prd-generation-workflow.md"];

export const createAppnestPrdPromptToolName = "create_appnest_prd_prompt";

export const createAppnestPrdPromptToolDescription = `
Builds **one prompt block for the AI editor**: loads **appnest-ai-context/appnest-prd-generator/prd-generation-workflow.md** from the project, tags that path, embeds the full workflow file, then appends the user's **sample PRD** text.

If the workflow file is missing, run **setup_appnest_ai_context** on the same **projectRoot** first.
`;

export const createAppnestPrdPromptToolSchema = {
  samplePrd: z
    .string()
    .min(1)
    .describe("Sample or draft PRD from the user; included after the workflow so the editor follows both."),
  projectRoot: z
    .string()
    .optional()
    .describe("Absolute path to the Appnest project root; defaults to the MCP process cwd."),
};

function workflowAbsolutePath(projectRoot) {
  return path.join(projectRoot, APPNEST_AI_CONTEXT_FOLDER, ...PRD_WORKFLOW_SEGMENTS);
}

export async function createAppnestPrdPromptToolCallback({
  samplePrd,
  projectRoot: projectRootArg,
} = {}) {
  const projectRoot = projectRootArg ? path.resolve(projectRootArg) : process.cwd();
  const workflowPath = workflowAbsolutePath(projectRoot);

  try {
    if (!fs.existsSync(workflowPath)) {
      const rel = path.join(APPNEST_AI_CONTEXT_FOLDER, ...PRD_WORKFLOW_SEGMENTS);
      return {
        content: [
          {
            type: "text",
            text:
              `❌ PRD workflow file not found:\n${workflowPath}\n\n` +
              `Expected: **${rel}** under the project root.\n` +
              `Run **setup_appnest_ai_context** with \`projectRoot: "${projectRoot}"\`, then call this tool again.`,
          },
        ],
      };
    }

    const workflowMarkdown = await fs.promises.readFile(workflowPath, "utf8");
    const relExpected = path.join(APPNEST_AI_CONTEXT_FOLDER, ...PRD_WORKFLOW_SEGMENTS);
    const relTag = path.relative(projectRoot, workflowPath) || relExpected;
    const absTag = path.resolve(workflowPath);

    const editorBlock = [
      "## Appnest PRD generation — instructions for the AI editor",
      "",
      "**Workflow file (reference):**",
      `- Relative: \`${relTag}\``,
      `- Absolute: \`${absTag}\``,
      "",
      "Follow the workflow below **and** the user’s sample PRD in the final section.",
      "",
      "---",
      "",
      "### Workflow: prd-generation-workflow.md",
      "",
      workflowMarkdown.trimEnd(),
      "",
      "---",
      "",
      "### User sample PRD",
      "",
      samplePrd.trim(),
      "",
    ].join("\n");

    return {
      content: [
        {
          type: "text",
          text: editorBlock,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `❌ Could not read PRD workflow:\n${workflowPath}\n\n${message}`,
        },
      ],
    };
  }
}
