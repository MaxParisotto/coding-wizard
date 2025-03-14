#!/usr/bin/env node

/**
 * This is a template MCP server that implements a powerful code assistant using Qdrant Vector DB to store and retrieve useful information
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

// Create the MCP server
const server = new McpServer({
  name: "coding-wizard",
  version: "0.1.0"
});

// Register resources and tools
registerResources(server);
registerTools(server);

// Start the server
async function startServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Coding Wizard MCP server running on stdio');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
startServer().catch(console.error);
