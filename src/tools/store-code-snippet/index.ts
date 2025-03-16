import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { 
    ensureCollectionExists,
    QDRANT_SERVER_URL,
    QDRANT_API_KEY,
    COLLECTION_NAME,
    getEmbedding,
} from '../../utils.js';
import { logger } from '../../logger.js';
import { validateInput } from '../common/types.js';

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
    await ensureCollectionExists();
    
    // Get embedding for the code
    const vector = await getEmbedding(payload.code || '');
    if (!vector) {
        throw new Error('Failed to get embedding for code');
    }
    
    const id = Date.now();
    const timestamp = new Date().toISOString();
    
    await axios.put(
        `${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`,
        {
            points: [{
                id,
                vector,
                payload: {
                    ...payload,
                    id,
                    created_at: timestamp,
                },
            }],
        },
        {
            headers: {
                ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
                'Content-Type': 'application/json'
            }
        }
    );

    return { id, timestamp };
}

export function registerStoreCodeSnippetTool(server: McpServer): void {
    server.tool(
        'store_code_snippet',
        'Stores a code snippet in the Qdrant vector database',
        storeCodeSnippetSchema.shape,
        async (params: z.infer<typeof storeCodeSnippetSchema>, _extra) => {
            const validatedParams = validateInput(storeCodeSnippetSchema, params);

            try {
                const searchableText = [
                    validatedParams.code,
                    validatedParams.description,
                    ...(validatedParams.tags || [])
                ].join(' ');

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