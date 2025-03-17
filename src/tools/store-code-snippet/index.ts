import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { 
    ensureCollectionExists,
    COLLECTION_NAME,
    getEmbedding,
    getClient
} from '../../utils.js';
import { logger, addFileTransports } from '../../logger.js';
import { validateInput } from '../common/types.js';
import { v4 as uuidv4 } from 'uuid';

interface QdrantPayload {
    type: string;
    code?: string;
    language?: string;
    description?: string;
    source?: string;
    tags?: string[];
    searchableText: string;
}

const storeCodeSnippetSchema = z.object({
    code: z.string(),
    description: z.string().optional().default(''),
    language: z.string().optional().default('JavaScript'),
    source: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([])
});

async function storeInQdrant(payload: QdrantPayload) {
    try {
        await ensureCollectionExists();
        logger.info('Collection exists, getting embedding...');
        
        // Get embedding for the code
        const vector = await getEmbedding(payload.code || '');
        if (!vector) {
            throw new Error('Failed to get embedding for code');
        }
        logger.info(`Got embedding with length ${vector.length}`);
        
        const id = uuidv4();
        const timestamp = new Date().toISOString();
        
        logger.info(`Storing point with ID ${id} in collection ${COLLECTION_NAME}`);
        
        const client = await getClient();
        if (!client) {
            throw new Error('Failed to initialize Qdrant client');
        }

        await client.upsert(COLLECTION_NAME, {
            points: [{
                id,
                vector,
                payload: {
                    ...payload,
                    id,
                    created_at: timestamp,
                }
            }]
        });

        logger.info('Successfully stored point in Qdrant');
        return { id, timestamp };
    } catch (error) {
        logger.error('Failed to store in Qdrant:', error);
        throw error;
    }
}

export function registerStoreCodeSnippetTool(server: McpServer): void {
    // Initialize logging
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    addFileTransports(logDir);
    logger.info('Initialized logging for store-code-snippet tool');

    server.tool(
        'store_code_snippet',
        'Stores a code snippet in the Qdrant vector database',
        storeCodeSnippetSchema.shape,
        async (params: z.infer<typeof storeCodeSnippetSchema>, _extra) => {
            try {
                logger.info('Validating input parameters...');
                const validatedParams = validateInput(storeCodeSnippetSchema, params);
                logger.info('Input validation successful');

                const searchableText = [
                    validatedParams.code,
                    validatedParams.description,
                    ...(validatedParams.tags || [])
                ].join(' ');

                logger.info('Storing code snippet in Qdrant...');
                await storeInQdrant({
                    type: 'code_snippet',
                    ...validatedParams,
                    searchableText
                });

                return {
                    content: [{ 
                        type: "text", 
                        text: 'Successfully stored the code snippet in the database.' 
                    }]
                };
            } catch (error) {
                logger.error('Failed to store code snippet:', error);
                if (error instanceof Error) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `Failed to store the code snippet: ${error.message}` 
                        }],
                        isError: true
                    };
                }
                return {
                    content: [{ 
                        type: "text", 
                        text: 'Failed to store the code snippet. Please try again.' 
                    }],
                    isError: true
                };
            }
        }
    );
} 