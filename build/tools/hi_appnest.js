import fs from "fs";
import path from "path";

const hiAppnestToolName = "hi_appnest";
const hiAppnestToolDescription =
  'Call when the user greets Appnest ("hi appnest", "hey appnest", etc.). Runs: setup basecode → setup appnest-ai-context → precheck → install-packages.';
const hiAppnestToolSchema = {};

const hiAppnestMessage = `
👋 Welcome to Appnest AI MCP!

I'll set up your Appnest project:
1️⃣ Set up Appnest base project in this folder  
2️⃣ Set up appnest-ai-context  
3️⃣ Run Appnest precheck  
4️⃣ Install packages  

Please wait… 🔧✨
`;

function parseToolOutput(result) {
  const raw = result?.content?.[0]?.text ?? "";
  const m = raw.match(/__MCP_EXIT_CODE__(?::(-?\d+))?$/m);
  const exitCode = m && m[1] !== undefined ? parseInt(m[1], 10) : null;
  const text = raw.replace(/\n\n__MCP_EXIT_CODE__:-?\d+\s*$/m, "").trim();
  return { text, exitCode };
}

function commandFailed({ text, exitCode }) {
  if (exitCode !== null && exitCode !== 0) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("❌") ||
    lower.includes("error:") ||
    lower.includes("failed") ||
    lower.includes("invalid command")
  );
}

async function hiAppnestToolCallback(_args, { callTool }) {
  const projectRoot = process.cwd();

  const cursorDir = path.join(projectRoot, ".cursor");
  if (!fs.existsSync(cursorDir)) {
    fs.mkdirSync(cursorDir, { recursive: true });
  }

  const basecode = await callTool("setup_appnest_app_basecode", { targetDir: projectRoot });
  const basecodeOut = parseToolOutput(basecode);
  if (basecodeOut.text.includes("❌") || basecodeOut.text.toLowerCase().includes("failed")) {
    return {
      content: [
        {
          type: "text",
          text: `${hiAppnestMessage.trim()}\n\n❌ Basecode setup step failed.\n\n${basecodeOut.text}\n\nFix the issue and run **hi appnest** again.`,
        },
      ],
    };
  }

  const setup = await callTool("setup_appnest_ai_context", { projectRoot });
  const setupText = setup?.content?.[0]?.text ?? "";
  if (setupText.includes("❌") || setupText.toLowerCase().includes("failed")) {
    return {
      content: [
        {
          type: "text",
          text: `${hiAppnestMessage.trim()}\n\n❌ appnest-ai-context setup failed.\n\n${setupText}\n\nFix the issue (network, disk, or paths) and run **hi appnest** again.`,
        },
      ],
    };
  }

  const precheck = await callTool("run_appnest_command", {
    command: "precheck",
    workingDirectory: projectRoot,
  });
  const pre = parseToolOutput(precheck);
  if (commandFailed(pre)) {
    return {
      content: [
        {
          type: "text",
          text: `${hiAppnestMessage.trim()}\n\n❌ Appnest precheck did not succeed — setup stopped.\n\n${pre.text}\n\nResolve the issues above and run **hi appnest** again.`,
        },
      ],
    };
  }

  const install = await callTool("run_appnest_command", {
    command: "install-packages",
    workingDirectory: projectRoot,
  });
  const inst = parseToolOutput(install);
  if (commandFailed(inst)) {
    return {
      content: [
        {
          type: "text",
          text: `${hiAppnestMessage.trim()}\n\n⚠️ Precheck passed but install-packages had problems.\n\n${inst.text}\n\nFix dependencies or PATH, then run **hi appnest** again or run \`appnest-development-engine app install-packages\` manually.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `${hiAppnestMessage.trim()}\n\n🎉 Appnest project setup completed!\n\n📦 ${basecodeOut.text.split("\n").find((l) => l.trim()) || "Project ready"}\n📂 appnest-ai-context ready\n🔍 Precheck OK\n⚙️ Packages installed\n\nYou can start building with Appnest.`,
      },
    ],
  };
}

export {
  hiAppnestToolName,
  hiAppnestToolDescription,
  hiAppnestToolSchema,
  hiAppnestToolCallback,
};
