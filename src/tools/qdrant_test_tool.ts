import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { testQdrantAPI } from './qdrant_test.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { validateInput } from './common/types.js';

const qdrantTestSchema = z.object({
    baseUrl: z.string().url().default(config.QDRANT_URL),
    apiKey: z.string().default(config.QDRANT_API_KEY || ''),
    vectorSize: z.number().int().positive().optional().default(config.QDRANT_VECTOR_SIZE),
    skipCleanup: z.boolean().optional().default(false),
    testTimeout: z.number().int().positive().optional().default(30000)
});

export function registerQdrantTestTool(server: McpServer): void {
    server.tool(
        'qdrant_test',
        'Run a comprehensive test suite for the Qdrant API',
        qdrantTestSchema.shape,
        async (params: z.infer<typeof qdrantTestSchema>, _extra) => {
            const validatedParams = validateInput(qdrantTestSchema, params);
            logger.info('Starting Qdrant API test suite...', { params: validatedParams });
            
            try {
                const startTime = Date.now();
                const success = await testQdrantAPI({
                    baseUrl: validatedParams.baseUrl || config.QDRANT_URL,
                    apiKey: validatedParams.apiKey || config.QDRANT_API_KEY || '',
                    vectorSize: validatedParams.vectorSize,
                    skipCleanup: validatedParams.skipCleanup,
                    testTimeout: validatedParams.testTimeout
                });
                const duration = Date.now() - startTime;

                const resultMessage = success 
                    ? `✅ All Qdrant API tests completed successfully in ${duration}ms! 🎉`
                    : `❌ Some tests failed. Check the logs for details. Duration: ${duration}ms`;

                return {
                    content: [{
                        type: "text",
                        text: resultMessage
                    }],
                    isError: !success
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                logger.error('Error running Qdrant tests:', error);
                
                return {
                    content: [{
                        type: "text",
                        text: `Test suite failed: ${errorMessage}`
                    }],
                    isError: true
                };
            }
        }
    );
} 