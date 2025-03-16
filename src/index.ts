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
            logger.error('Failed to initialize server components:', error);
            throw error;
        }
    } catch (error) {
        logger.error('Server startup failed:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal, shutting down...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal, shutting down...');
    process.exit(0);
});

// Start the server
startServer();