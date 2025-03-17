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
import { validateInput } from '../../common/types.js';
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
let cachedClient: any = null;

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
        const vector = await getEmbedding(payload.code || '');
        if (!vector) {
            throw new Error('Failed to get embedding for code');
        }
        logger.info(`Got embedding with length ${vector.length}`);
        
        if (!cachedClient) {
            cachedClient = await getClient();
            if (!cachedClient) {
                throw new Error('Failed to get Qdrant client');
            }
        }
        const client = cachedClient;

        const snippetId = uuidv4();
        
        await client.upsert(COLLECTION_NAME, {
            points: [{
                id: snippetId,
                vector,
                payload: {
                    ...payload,
                    created_at: new Date().toISOString(),
                }
            }]
        });

        logger.info('Successfully stored point in Qdrant');
        return { id: snippetId, createdAt: new Date().toISOString() };
    } catch (error) {
        logger.error('Failed to store in Qdrant:', error);
        throw error;
    }
}
                        id: snippetId,
                        created_at: timestamp,
                    }
                }]
            });
            logger.info('Successfully stored point in Qdrant');
            return { id: snippetId, timestamp };
        } catch (upsertError) {
            logger.error('Failed to upsert point in Qdrant:', upsertError);
            throw upsertError;
        }
    } catch (error) {
        async (params: z.infer<typeof storeCodeSnippetSchema>, _context) => {
        throw error;
    }
}
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
                        // The type of content, in this case, it's text
                        type: "text", 
                        // The message to be displayed
                        text: 'Successfully stored the code snippet in the database.' 
                    }]
                };
            } catch (error) {
                logger.error('Failed to store code snippet:', error);
                if (error instanceof Error) {
                    return {
                        content: [{ 
                            // The type of content, in this case, it's text
                            type: "text", 
                            // The error message to be displayed
                            text: `Failed to store the code snippet: ${error.message}` 
                        }],
                        // Indicates that an error occurred
                        isError: true
                    };
                }
                return {
                    content: [{ 
                        // The type of content, in this case, it's text
                        type: "text", 
                        // The generic error message to be displayed
                        text: 'Failed to store the code snippet. Please try again.' 
                    }],
                    // Indicates that an error occurred
                    isError: true
                };
            }
        }
    );
}               };
            }
        }
    );
} 