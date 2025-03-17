import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
    ensureCollectionExists,
    COLLECTION_NAME,
    getEmbedding,
    getClient
} from '../../utils.js';
import { logger } from '../../logger.js';
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
    // The code snippet to be stored
    code: z.string(),
    // An optional description of the code snippet
    description: z.string().optional().default(''),
    // The programming language of the code snippet, defaults to 'JavaScript'
    language: z.string().optional().default('JavaScript'),
    // The source or origin of the code snippet
    source: z.string().optional().default(''),
    // An array of tags associated with the code snippet
    tags: z.array(z.string()).optional().default([])
});

async function storeInQdrant(payload: QdrantPayload) {
    try {
        const vector = await getEmbedding(payload.code || '');
        if (!vector) {
            throw new Error('Failed to get embedding for code');
        }
        
        const client = await getClient();
        if (!client) {
            throw new Error('Failed to get Qdrant client');
        }

        const snippetId = uuidv4();
        const timestamp = new Date().toISOString();
        
        await client.upsert(COLLECTION_NAME, {
            points: [{
                id: snippetId,
                vector,
                payload: {
                    ...payload,
                    created_at: timestamp,
                }
            }]
        });

        return { id: snippetId, createdAt: timestamp };
    } catch (error) {
        logger.error('Failed to store in Qdrant:', error);
        throw error;
    }
}

export function registerStoreCodeSnippetTool(server: McpServer): void {
    server.tool(
        'coding_wizard_store_code_snippet',
        'Stores a code snippet in the Qdrant vector database',
        storeCodeSnippetSchema.shape,
        async (params: z.infer<typeof storeCodeSnippetSchema>) => {
            try {
                const searchableText = [
                    params.code,
                    params.description,
                    ...(params.tags || [])
                ].join(' ');

                logger.info('Storing code snippet in Qdrant...');
                const result = await storeInQdrant({
                    type: 'code_snippet',
                    ...params,
                    searchableText
                });

                return {
                    content: [{ 
                        type: 'text',
                        text: `Successfully stored the code snippet in the database with ID: ${result.id}`
                    }]
                };
            } catch (error) {
                logger.error('Failed to store code snippet:', error);
                return {
                    content: [{ 
                        type: 'text',
                        text: `Failed to store the code snippet: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
            }
        }
    );
} 