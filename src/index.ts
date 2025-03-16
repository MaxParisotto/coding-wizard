#!/usr/bin/env node

/**
 * This is a MCP server that implements a powerful code assistant using Qdrant Vector DB to store and retrieve useful information
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';
import { config } from './config.js';
import { logger, addFileTransports } from './logger.js';
import fs from 'fs';
import path from 'path';
import { qdrantTestTool } from './tools/qdrant_test_tool.js';

// Initialize logging
function initializeLogging() {
  const logsDir = path.join(process.cwd(), config.LOG_DIR);
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
    }
    addFileTransports(logsDir);
    logger.info('Logging initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize file logging, falling back to console only:', error);
  }
}

// Enhanced server initialization with proper error handling
async function startServer() {
  try {
    // Initialize logging first
    initializeLogging();
    
    logger.info('Starting Coding Wizard MCP server...');
    
    // Create the MCP server with configuration
    const server = new McpServer({
      name: config.SERVER_NAME,
      version: config.SERVER_VERSION,
      description: config.SERVER_DESCRIPTION
    });
    
    // Initialize resources and tools with proper error handling
    try {
      await registerResources(server);
      await registerTools(server);  // Register all tools including coding wizard tools
      
      // Set up the transport and start the server
      const transport = new StdioServerTransport();
      await server.connect(transport);
      
      logger.info('Server started successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      process.exit(1);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal, shutting down...');
      try {
        await server.close();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down...');
      try {
        await server.close();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the enhanced server
startServer().catch((error) => {
  logger.error('Fatal error during server startup:', error);
  process.exit(1);
});