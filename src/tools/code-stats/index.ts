import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { 
    QDRANT_SERVER_URL,
    QDRANT_API_KEY,
    COLLECTION_NAME,
} from '../../utils.js';
import { logger } from '../../logger.js';
import { validateInput, formatResponse } from '../common/types.js';

interface QdrantPoint {
    id: number;
    payload: {
        language: string;
        tags: string[];
        description: string;
        created_at: string;
    };
}

interface CodeStats {
    total_snippets: number;
    languages: Record<string, number>;
    tags: Record<string, number>;
    recent_snippets: Array<{
        id: number;
        language: string;
        description: string;
        created_at: string;
    }>;
}

const codeStatsSchema = z.object({
    recent_limit: z.number().min(1).max(10).optional().default(5)
});

async function getCodeStats(params: { recent_limit: number }): Promise<CodeStats> {
    // Get all points to analyze
    const response = await axios.post(
        `${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/scroll`,
        {
            limit: 10000,
            with_payload: true,
            with_vector: false
        },
        {
            headers: {
                ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
                'Content-Type': 'application/json'
            }
        }
    );

    const points = response.data.result.points as QdrantPoint[];
    const stats: CodeStats = {
        total_snippets: points.length,
        languages: {},
        tags: {},
        recent_snippets: []
    };

    // Process each point
    points.forEach((point: QdrantPoint) => {
        const { language, tags = [], description = '', created_at } = point.payload;

        // Count languages
        stats.languages[language] = (stats.languages[language] || 0) + 1;

        // Count tags
        tags.forEach((tag: string) => {
            stats.tags[tag] = (stats.tags[tag] || 0) + 1;
        });

        // Add to recent snippets if needed
        if (stats.recent_snippets.length < params.recent_limit) {
            stats.recent_snippets.push({
                id: point.id,
                language,
                description,
                created_at
            });
        }
    });

    // Sort recent snippets by date
    stats.recent_snippets.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return stats;
}

function formatStats(stats: CodeStats): { type: "text"; text: string }[] {
    const content = [
        `Total Code Snippets: ${stats.total_snippets}`,
        '',
        '## Languages',
        ...Object.entries(stats.languages)
            .sort(([, a], [, b]) => b - a)
            .map(([lang, count]) => `- ${lang}: ${count} snippets`),
        '',
        '## Popular Tags',
        ...Object.entries(stats.tags)
            .sort(([, a], [, b]) => b - a)
            .map(([tag, count]) => `- ${tag}: ${count} uses`),
        '',
        '## Recent Snippets',
        ...stats.recent_snippets.map(snippet => 
            `- [${snippet.language}] ${snippet.description || 'No description'} (${new Date(snippet.created_at).toLocaleString()})`)
    ].join('\n');

    return [{ type: "text", text: content }];
}

export function registerCodeStatsTool(server: McpServer): void {
    server.tool(
        'code_stats',
        'Get statistics about stored code snippets',
        codeStatsSchema.shape,
        async (params: z.infer<typeof codeStatsSchema>, _extra) => {
            const validatedParams = validateInput(codeStatsSchema, params);
            
            try {
                const stats = await getCodeStats({ 
                    recent_limit: validatedParams.recent_limit ?? 5 
                });
                return {
                    content: formatStats(stats)
                };
            } catch (error) {
                logger.error('Failed to get code stats:', error);
                return {
                    content: [{ type: "text", text: 'Failed to get code statistics. Please try again.' }],
                    isError: true
                };
            }
        }
    );
} 