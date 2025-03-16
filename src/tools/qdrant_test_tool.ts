import { testQdrantAPI } from './qdrant_test.js';
import { logger } from '../utils/logger.js';

interface HandlerParams {
    baseUrl: string;
    apiKey: string;
}

interface MCPTool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
    };
    handler: (params: HandlerParams) => Promise<{
        success: boolean;
        message: string;
    }>;
}

export const qdrantTestTool: MCPTool = {
    name: 'qdrant_test',
    description: 'Run a comprehensive test suite for the Qdrant API',
    parameters: {
        type: 'object',
        properties: {
            baseUrl: {
                type: 'string',
                description: 'The base URL of the Qdrant API'
            },
            apiKey: {
                type: 'string',
                description: 'The API key for authentication'
            }
        },
        required: ['baseUrl', 'apiKey']
    },
    handler: async ({ baseUrl, apiKey }: HandlerParams) => {
        logger.info('Starting Qdrant API test suite...');
        
        try {
            const success = await testQdrantAPI({ baseUrl, apiKey });
            return {
                success,
                message: success 
                    ? 'All Qdrant API tests completed successfully! 🎉' 
                    : 'Some tests failed. Check the logs for details.'
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logger.error('Error running Qdrant tests:', error);
            return {
                success: false,
                message: `Test suite failed: ${errorMessage}`
            };
        }
    }
}; 