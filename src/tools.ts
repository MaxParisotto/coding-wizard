/**
 * Tool handlers for the coding-wizard MCP server
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { 
  ensureCollectionExists,
  QDRANT_SERVER_URL,
  COLLECTION_NAME,
} from './utils.js';

interface QdrantPayload {
  type: string;
  code?: string;
  language?: string;
  description?: string;
  source?: string;
  tags?: string[];
  searchableText: string;
}

function validateInput<T>(schema: z.ZodSchema<T>, params: unknown): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new Error(`Invalid input: ${result.error.message}`);
  }
  return result.data;
}

interface McpResponse {
  [key: string]: unknown;
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
      [key: string]: unknown;
      text: string;
      uri: string;
      mimeType?: string;
    } | {
      [key: string]: unknown;
      blob: string;
      uri: string;
      mimeType?: string;
    };
  }>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}

function formatResponse(options: {
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
      type: 'text' as const,
      text: responseText,
    }],
    _meta: {
      timestamp: new Date().toISOString(),
    },
  };
}

async function storeInQdrant(payload: QdrantPayload) {
  await ensureCollectionExists();
  
  const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
  const timestamp = new Date().toISOString();
  
  await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
    points: [{
      id,
      payload: {
        ...payload,
        id,
        created_at: timestamp,
      },
    }],
  });

  return { id, timestamp };
}

// Define Zod schemas for tool inputs
const codeSnippetSchema = z.object({
  code: z.string(),
  language: z.string().optional().default('JavaScript'),
  description: z.string().optional().default(''),
  source: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
});

/**
 * Register tool handlers with the server
 */
export function registerTools(server: McpServer): void {
  /**
   * Handler for the store_code_snippet tool.
   * Stores a code snippet in the Qdrant vector database for later retrieval.
   */
  server.tool(
    'store_code_snippet',
    'Stores a code snippet in the Qdrant vector database',
    codeSnippetSchema.shape,
    async (args: unknown) => {
      const { code, language = 'JavaScript', description = '', source = '', tags = [] } = 
        validateInput(codeSnippetSchema, args);

      const payload: QdrantPayload = {
        type: 'code_snippet',
        code,
        language,
        description,
        source,
        tags,
        searchableText: `${language} ${description} ${source} ${tags.join(' ')} ${code.substring(0, 1000)}`,
      };

      const result = await storeInQdrant(payload);
      
      return formatResponse({
        title: `✅ Successfully stored ${language} code snippet`,
        content: [
          `ID: ${result.id}`,
          `Description: ${description || 'N/A'}`,
          `Tags: ${tags.length > 0 ? tags.join(', ') : 'None'}`,
          `Source: ${source || 'N/A'}`,
          `Created: ${result.timestamp}`,
          '\nYou can retrieve this snippet later using:',
          '- search_code_snippets with a relevant query',
        ],
      });
    },
  );

  // ... rest of the file remains the same ...
}
