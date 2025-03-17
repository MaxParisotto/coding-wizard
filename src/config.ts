import { z } from 'zod';
import dotenv from 'dotenv';
import { logger } from './logger.js';

// Load environment variables from .env file
dotenv.config();

// Define the configuration schema using Zod
const configSchema = z.object({
  // Server configuration
  SERVER_NAME: z.string().default('coding-wizard'),
  SERVER_VERSION: z.string().default('0.2.0'),
  SERVER_DESCRIPTION: z.string().default('A powerful coding assistant with code generation, analysis, and management capabilities'),
  
  // Qdrant configuration
  QDRANT_URL: z.string().url().default('http://192.168.3.171:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('mcp'),
  QDRANT_VECTOR_SIZE: z.number().int().positive().default(768),
  
  // Embedding service configuration
  EMBEDDING_API_URL: z.string().url().default('http://192.168.3.171:8000/embed'),
  
  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
  
  // API configuration
  CODE_GENERATION_API: z.string().url().optional(),
  CODE_COMPLETION_API: z.string().url().optional(),
  
  // Development configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Create a type from the schema
type Config = z.infer<typeof configSchema>;

// Function to validate and load configuration
function loadConfig(): Config {
  try {
    // Validate environment variables against schema
    const config = configSchema.parse({
      SERVER_NAME: process.env.SERVER_NAME,
      SERVER_VERSION: process.env.SERVER_VERSION,
      SERVER_DESCRIPTION: process.env.SERVER_DESCRIPTION,
      QDRANT_URL: process.env.QDRANT_URL,
      QDRANT_API_KEY: process.env.QDRANT_API_KEY,
      QDRANT_COLLECTION: process.env.QDRANT_COLLECTION,
      QDRANT_VECTOR_SIZE: process.env.QDRANT_VECTOR_SIZE ? parseInt(process.env.QDRANT_VECTOR_SIZE) : undefined,
      EMBEDDING_API_URL: process.env.EMBEDDING_API_URL,
      LOG_LEVEL: process.env.LOG_LEVEL as Config['LOG_LEVEL'],
      LOG_DIR: process.env.LOG_DIR,
      CODE_GENERATION_API: process.env.CODE_GENERATION_API,
      CODE_COMPLETION_API: process.env.CODE_COMPLETION_API,
      NODE_ENV: process.env.NODE_ENV as Config['NODE_ENV'],
    });

    // Log configuration (excluding sensitive values)
    logger.info('Configuration loaded successfully');
    logger.debug('Current configuration:', {
      ...config,
      // Exclude sensitive values from logging
      CODE_GENERATION_API: config.CODE_GENERATION_API ? '[REDACTED]' : undefined,
      CODE_COMPLETION_API: config.CODE_COMPLETION_API ? '[REDACTED]' : undefined,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Configuration validation failed:', error.errors);
      throw new Error('Invalid configuration. Check your environment variables.');
    }
    throw error;
  }
}

// Export the configuration
export const config = loadConfig();

// Export types
export type { Config }; 