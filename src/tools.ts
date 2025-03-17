/**
 * Tool handlers for the coding-wizard MCP server
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerStoreCodeSnippetTool } from './tools/store-code-snippet/index.js';
import { registerSearchCodeSnippetsTool } from './tools/search-code-snippets/index.js';
import { registerCodeStatsTool } from './tools/code-stats/index.js';
import { registerQdrantTestTool } from './tools/qdrant_test_tool.js';
import { logger } from './logger.js';

/**
 * Register all tool handlers with the server
 */
export function registerTools(server: McpServer): void {
  try {
    // Register store code snippet tool
    registerStoreCodeSnippetTool(server);
    logger.info('Store code snippet tool registered successfully');

    // Register search code snippets tool
    registerSearchCodeSnippetsTool(server);
    logger.info('Search code snippets tool registered successfully');

    // Register code stats tool
    registerCodeStatsTool(server);
    logger.info('Code stats tool registered successfully');

    // Register Qdrant test tool
    registerQdrantTestTool(server);
    logger.info('Qdrant test tool registered successfully');

    logger.info('All tools registered successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to register tools:', errorMessage);
    throw new Error('Failed to register tools');
  }
}
