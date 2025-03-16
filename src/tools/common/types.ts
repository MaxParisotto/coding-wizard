import { z } from 'zod';

export interface McpResponse {
    content: Array<{
        type: 'text';
        text: string;
    } | {
        type: 'image';
        data: string;
        mimeType: string;
    } | {
        type: 'resource';
        resource: {
            text: string;
            uri: string;
            mimeType?: string;
        } | {
            blob: string;
            uri: string;
            mimeType?: string;
        };
    }>;
    _meta?: Record<string, unknown>;
    isError?: boolean;
}

export function validateInput<T>(schema: z.ZodSchema<T>, params: unknown): T {
    const result = schema.safeParse(params);
    if (!result.success) {
        throw new Error(`Invalid input: ${result.error.message}`);
    }
    return result.data;
}

export function formatResponse(options: {
    title: string;
    content?: string[];
    sections?: Array<{
        title: string;
        content: string[];
    } | null>;
}): McpResponse {
    let responseText = `# ${options.title}\n\n`;
    
    if (options.content) {
        responseText += options.content.join('\n') + '\n\n';
    }
    
    if (options.sections) {
        options.sections.forEach(section => {
            if (section) {
                responseText += `## ${section.title}\n\n`;
                responseText += section.content.join('\n') + '\n\n';
            }
        });
    }
    
    return {
        content: [{
            type: 'text',
            text: responseText,
        }],
        _meta: {
            timestamp: new Date().toISOString(),
        },
    };
} 