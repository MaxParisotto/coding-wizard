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
      description: config.SERVER_DESCRIPTION,
    });
    
    // Initialize resources and tools with proper error handling
    try {
      await registerResources(server);
      logger.info('Resources registered successfully');
    } catch (error) {
      logger.error('Failed to register resources:', error);
      throw error;
    }

    try {
      registerTools(server);
      logger.info('Tools registered successfully');
    } catch (error) {
      logger.error('Failed to register tools:', error);
      throw error;
    }
    
    // Log initialization details
    logger.info('Server initialized with configuration:');
    logger.info(`- Environment: ${config.NODE_ENV}`);
    logger.info(`- Qdrant URL: ${config.QDRANT_URL}`);
    logger.info(`- Embedding API: ${config.EMBEDDING_API_URL}`);
    
    // Start the server with proper error handling
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Server connected to stdio transport');
    
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