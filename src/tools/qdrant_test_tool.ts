import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { testQdrantAPI } from './qdrant_test.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { validateInput } from './common/types.js';

export const qdrantTestSchema = z.object({
    baseUrl: z.string().url().default('http://192.168.2.190:6333'),
    apiKey: z.string().optional(),
    vectorSize: z.number().positive().default(768),
    skipCleanup: z.boolean().default(false),
    testTimeout: z.number().positive().default(30000),
});

export type QdrantTestParams = z.infer<typeof qdrantTestSchema>;

export function registerQdrantTestTool(server: McpServer): void {
    server.tool(
        'coding_wizard_qdrant_test',
        'Run a comprehensive test suite for the Qdrant API',
        qdrantTestSchema.shape,
        async (params: QdrantTestParams, _extra) => {
            const validatedParams = validateInput(qdrantTestSchema, params);
            logger.info('Starting Qdrant API test suite...', { 
                baseUrl: validatedParams.baseUrl || 'http://192.168.2.190:6333',
                vectorSize: validatedParams.vectorSize || 768,
                skipCleanup: validatedParams.skipCleanup || false,
                testTimeout: validatedParams.testTimeout || 30000,
                hasApiKey: !!validatedParams.apiKey
            });
            
            try {
                const startTime = Date.now();
                const success = await testQdrantAPI({
                    baseUrl: validatedParams.baseUrl || 'http://192.168.2.190:6333',
                    apiKey: validatedParams.apiKey || '',
                    vectorSize: validatedParams.vectorSize || 768,
                    skipCleanup: validatedParams.skipCleanup || false,
                    testTimeout: validatedParams.testTimeout || 30000
                });
                const duration = Date.now() - startTime;

                if (success) {
                    return {
                        content: [{
                            type: "text",
                            text: `✅ All Qdrant API tests completed successfully!\n\nDuration: ${duration}ms\nServer: ${validatedParams.baseUrl}\nVector Size: ${validatedParams.vectorSize}\n\nCheck the logs for detailed test results and telemetry data. 🎉`
                        }],
                        isError: false
                    };
                } else {
                    return {
                        content: [{
                            type: "text",
                            text: `❌ Some tests failed. Check the logs for details.\n\nDuration: ${duration}ms\nServer: ${validatedParams.baseUrl}\nVector Size: ${validatedParams.vectorSize}\n\nReview the logs for specific test failures and telemetry information.`
                        }],
                        isError: true
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                logger.error('Error running Qdrant tests:', error);
                
                return {
                    content: [{
                        type: "text",
                        text: `Test suite failed with error:\n${errorMessage}\n\nServer: ${validatedParams.baseUrl}\nVector Size: ${validatedParams.vectorSize}\n\nCheck the logs for more details.`
                    }],
                    isError: true
                };
            }
        }
    );
}

export default registerQdrantTestTool; 