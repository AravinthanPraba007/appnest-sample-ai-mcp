#!/usr/bin/env node
import { config } from 'dotenv';
// MCP stdio transport: stdout must be JSON-RPC only. dotenv v17+ logs to stdout unless quiet.
config({ quiet: true });
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  hiAppnestToolName,
  hiAppnestToolDescription,
  hiAppnestToolSchema,
  hiAppnestToolCallback,
} from './tools/hi_appnest.js';
import {
  setupAppnestAppBasecodeToolName,
  setupAppnestAppBasecodeToolDescription,
  setupAppnestAppBasecodeToolSchema,
  setupAppnestAppBasecodeToolCallback,
} from './tools/setup_appnest_app_basecode.js';
import {
  runAppnestEngineCommandToolName,
  runAppnestEngineCommandToolDescription,
  runAppnestEngineCommandToolSchema,
  runAppnestEngineCommandToolCallback,
} from './tools/run_appnest_engine_command.js';
import {
  setupAppnestAiContextToolName,
  setupAppnestAiContextToolDescription,
  setupAppnestAiContextToolSchema,
  setupAppnestAiContextToolCallback,
} from './tools/setup_appnest_ai_context.js';
import {
  setupAppnestAppRuntimeToolName,
  setupAppnestAppRuntimeToolDescription,
  setupAppnestAppRuntimeToolSchema,
  setupAppnestAppRuntimeToolCallback,
} from './tools/setup_appnest_app_runtime.js';
import {
  createAppnestPrdPromptToolName,
  createAppnestPrdPromptToolDescription,
  createAppnestPrdPromptToolSchema,
  createAppnestPrdPromptToolCallback,
} from './tools/create_appnest_prd_prompt.js';

/**
 * Creates a callTool function so tools can invoke other tools by name.
 * The MCP SDK does not provide this; we inject it via wrapped callbacks.
 */
function createCallTool(server) {
  return (extra) => {
    const callTool = async (name, toolArgs = {}) => {
      const tool = server._registeredTools[name];
      if (!tool) throw new Error(`Tool ${name} not found`);
      let args = toolArgs;
      if (tool.inputSchema && typeof tool.inputSchema.safeParseAsync === 'function') {
        const parsed = await tool.inputSchema.safeParseAsync(toolArgs);
        if (!parsed.success) throw new Error(`Invalid args for ${name}: ${parsed.error.message}`);
        args = parsed.data;
      }
      return await tool.callback(args, { ...extra, callTool });
    };
    return callTool;
  };
}

function withCallTool(server, callback) {
  const getCallTool = createCallTool(server);
  return (args, extra) => callback(args, { ...extra, callTool: getCallTool(extra) });
}

try {
  const server = new McpServer({ name: 'Appnest MCP', version: '1.0.0' });
  server.tool(
    hiAppnestToolName,
    hiAppnestToolDescription,
    hiAppnestToolSchema,
    withCallTool(server, hiAppnestToolCallback)
  );
  server.tool(
    setupAppnestAppBasecodeToolName,
    setupAppnestAppBasecodeToolDescription,
    setupAppnestAppBasecodeToolSchema,
    setupAppnestAppBasecodeToolCallback
  );
  server.tool(
    runAppnestEngineCommandToolName,
    runAppnestEngineCommandToolDescription,
    runAppnestEngineCommandToolSchema,
    runAppnestEngineCommandToolCallback
  );
  server.tool(
    setupAppnestAiContextToolName,
    setupAppnestAiContextToolDescription,
    setupAppnestAiContextToolSchema,
    setupAppnestAiContextToolCallback
  );
  server.tool(
    setupAppnestAppRuntimeToolName,
    setupAppnestAppRuntimeToolDescription,
    setupAppnestAppRuntimeToolSchema,
    setupAppnestAppRuntimeToolCallback
  );
  server.tool(
    createAppnestPrdPromptToolName,
    createAppnestPrdPromptToolDescription,
    createAppnestPrdPromptToolSchema,
    createAppnestPrdPromptToolCallback
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
} catch (error) {
  process.exit(1);
}
