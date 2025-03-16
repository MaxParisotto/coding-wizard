import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { 
    QDRANT_SERVER_URL,
    QDRANT_API_KEY,
    COLLECTION_NAME,
    getEmbedding,
} from '../../utils.js';
import { logger } from '../../logger.js';
import { validateInput } from '../common/types.js';

interface SearchResult {
    id: number;
    score: number;
    payload: {
        code: string;
        language: string;
        description: string;
        source: string;
        tags: string[];
        created_at: string;
    };
}

interface QdrantFilter {
    must: Array<{
        key: string;
        match: { value: string } | { any: string[] };
    }>;
}

const searchCodeSnippetsSchema = z.object({
    query: z.string(),
    limit: z.number().min(1).max(20).optional().default(5),
    filter_language: z.string().optional(),
    filter_tags: z.array(z.string()).optional(),
    min_score: z.number().min(0).max(1).optional().default(0.7)
});

interface SearchParams {
    query: string;
    limit: number;
    min_score: number;
    filter_language?: string;
    filter_tags?: string[];
}

async function searchInQdrant(params: SearchParams) {
    const { query, limit, filter_language, filter_tags, min_score } = params;
    
    // Get embedding for the search query
    const vector = await getEmbedding(query);
    if (!vector) {
        throw new Error('Failed to get embedding for search query');
    }

    // Build filter conditions
    const filter: QdrantFilter = {
        must: []
    };

    if (filter_language) {
        filter.must.push({
            key: 'language',
            match: { value: filter_language }
        });
    }

    if (filter_tags && filter_tags.length > 0) {
        filter.must.push({
            key: 'tags',
            match: { any: filter_tags }
        });
    }

    // Perform search
    const response = await axios.post(
        `${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`,
        {
            vector,
            limit,
            filter: filter.must.length > 0 ? filter : undefined,
            score_threshold: min_score
        },
        {
            headers: {
                ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
                'Content-Type': 'application/json'
            }
        }
    );

    return response.data.result as SearchResult[];
}

function formatSearchResults(results: SearchResult[]): { type: "text"; text: string }[] {
    if (results.length === 0) {
        return [{ type: "text", text: 'No matching code snippets found.' }];
    }

    const formattedResults = results.map(result => {
        const { code, language, description, tags, created_at } = result.payload;
        const score = (result.score * 100).toFixed(1);
        
        return [
            `Match Score: ${score}%`,
            `Language: ${language}`,
            description ? `Description: ${description}` : null,
            tags.length > 0 ? `Tags: ${tags.join(', ')}` : null,
            `Created: ${new Date(created_at).toLocaleString()}`,
            '\`\`\`' + language,
            code,
            '\`\`\`',
            '---'
        ].filter(Boolean).join('\n');
    });

    return [{ type: "text", text: formattedResults.join('\n\n') }];
}

export function registerSearchCodeSnippetsTool(server: McpServer): void {
    server.tool(
        'search_code_snippets',
        'Search for code snippets using semantic search',
        searchCodeSnippetsSchema.shape,
        async (params: z.infer<typeof searchCodeSnippetsSchema>, _extra) => {
            const validatedParams = validateInput(searchCodeSnippetsSchema, params);
            
            try {
                const results = await searchInQdrant({
                    query: validatedParams.query,
                    limit: validatedParams.limit ?? 5,
                    min_score: validatedParams.min_score ?? 0.7,
                    filter_language: validatedParams.filter_language,
                    filter_tags: validatedParams.filter_tags
                });
                return {
                    content: formatSearchResults(results)
                };
            } catch (error) {
                logger.error('Failed to search code snippets:', error);
                return {
                    content: [{ type: "text", text: 'Failed to search code snippets. Please try again.' }],
                    isError: true
                };
            }
        }
    );
} 