#!/usr/bin/env node
import { config } from 'dotenv';
config();
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  hiAppnestToolName,
  hiAppnestToolDescription,
  hiAppnestToolSchema,
  hiAppnestToolCallback,
} from './tools/hi_appnest.js';
import {
  cloneAppnestBasecodeToolName,
  cloneAppnestBasecodeToolDescription,
  cloneAppnestBasecodeToolSchema,
  cloneAppnestBasecodeToolCallback,
} from './tools/clone_appnest_basecode.js';
import {
  runAppnestEngineCommandToolName,
  runAppnestEngineCommandToolDescription,
  runAppnestEngineCommandToolSchema,
  runAppnestEngineCommandToolCallback,
} from './tools/run_appnest_engine_command.js';
import {
  setupAppnestToolsToolName,
  setupAppnestToolsToolDescription,
  setupAppnestToolsToolSchema,
  setupAppnestToolsToolCallback,
} from './tools/setup_appnest_tools.js';

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
    cloneAppnestBasecodeToolName,
    cloneAppnestBasecodeToolDescription,
    cloneAppnestBasecodeToolSchema,
    cloneAppnestBasecodeToolCallback
  );
  server.tool(
    runAppnestEngineCommandToolName,
    runAppnestEngineCommandToolDescription,
    runAppnestEngineCommandToolSchema,
    runAppnestEngineCommandToolCallback
  );
  server.tool(
    setupAppnestToolsToolName,
    setupAppnestToolsToolDescription,
    setupAppnestToolsToolSchema,
    setupAppnestToolsToolCallback
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
} catch (error) {
  console.error('Appnest MCP Error', error);
  process.exit(1);
}
