/**
 * Tool handlers for the coding-wizard MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { 
  ensureCollectionExists, 
  analyzeCode, 
  formatRustCode, 
  formatJsCode, 
  formatPythonCode, 
  findSimilarPatterns,
  QDRANT_SERVER_URL,
  COLLECTION_NAME
} from "./utils.js";

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
    type: "text";
    text: string;
  } | {
    type: "image";
    data: string;
    mimeType: string;
  } | {
    type: "resource";
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
      type: "text" as const,
      text: responseText
    }],
    _meta: {
      timestamp: new Date().toISOString()
    }
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
        created_at: timestamp
      }
    }]
  });

  return { id, timestamp };
}

interface FormatCodeResult {
  formattedCode: string;
  formattingResult: string;
}

async function formatCode(code: string, language: string): Promise<FormatCodeResult> {
  let formattedCode = code;
  let formattingResult = "";
  
  if (language === "rust") {
    const rustResult = await formatRustCode(code);
    formattedCode = rustResult.formattedCode;
    formattingResult = rustResult.lintOutput;
  } else if (language === "javascript" || language === "typescript") {
    const jsResult = await formatJsCode(code);
    formattedCode = jsResult.formattedCode;
    formattingResult = jsResult.lintOutput;
  } else if (language === "python") {
    const pythonResult = await formatPythonCode(code);
    formattedCode = pythonResult.formattedCode;
    formattingResult = pythonResult.lintOutput;
  }
  
  return { formattedCode, formattingResult };
}

// Define Zod schemas for tool inputs
const codeSnippetSchema = z.object({
  code: z.string(),
  language: z.string().optional().default("JavaScript"),
  description: z.string().optional().default(""),
  source: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([])
});

const codeReviewSchema = z.object({
  code: z.string(),
  language: z.string()
});

const searchSnippetsSchema = z.object({
  query: z.string(),
  language: z.string().optional().default(""),
  limit: z.number().optional().default(5)
});

const dependencySchema = z.object({
  name: z.string(),
  version: z.string(),
  language: z.string(),
  description: z.string().optional().default(""),
  usage_example: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([])
});

const crateDocumentationSchema = z.object({
  name: z.string(),
  version: z.string().optional().default(""),
  documentation: z.string(),
  examples: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([])
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
    "store_code_snippet",
    "Stores a code snippet in the Qdrant vector database",
    codeSnippetSchema.shape,
    async (args, extra) => {
      const { code, language = "JavaScript", description = "", source = "", tags = [] } = 
        validateInput(codeSnippetSchema, args);

      const payload: QdrantPayload = {
        type: "code_snippet",
        code,
        language,
        description,
        source,
        tags,
        searchableText: `${language} ${description} ${source} ${tags.join(' ')} ${code.substring(0, 1000)}`
      };

      const result = await storeInQdrant(payload);
      
      return formatResponse({
        title: `✅ Successfully stored ${language} code snippet`,
        content: [
          `ID: ${result.id}`,
          `Description: ${description || "N/A"}`,
          `Tags: ${tags.length > 0 ? tags.join(', ') : "None"}`,
          `Source: ${source || "N/A"}`,
          `Created: ${result.timestamp}`,
          `\nYou can retrieve this snippet later using:`,
          `- search_code_snippets with a relevant query`
        ]
      });
    }
  );

  /**
   * Provides code review and suggestions for multiple programming languages.
   */
  server.tool(
    "code_review",
    "Provides code review and suggestions for multiple programming languages",
    codeReviewSchema.shape,
    async (args, extra) => {
      const { code, language } = validateInput(codeReviewSchema, args);
      const normalizedLanguage = language.toLowerCase();
      
      const analysis = analyzeCode(code, normalizedLanguage);
      const { formattedCode, formattingResult } = await formatCode(code, normalizedLanguage);
      const similarPatterns = await findSimilarPatterns(code, normalizedLanguage);
      
      const sections = [
        {
          title: "Analysis",
          content: analysis.issues.length > 0 
            ? analysis.issues.map((issue, index) => 
                `${index + 1}. **${issue.severity}**: ${issue.message}` + 
                (issue.suggestion ? `\n   - Suggestion: ${issue.suggestion}` : '') +
                (issue.line ? `\n   - Line: ${issue.line}` : '')
              )
            : ["No major issues found in the basic analysis"]
        },
        {
          title: "Best Practices",
          content: analysis.bestPractices.map((practice, index) => 
            `${index + 1}. ${practice}`
          )
        },
        {
          title: "Formatted Code",
          content: [`\`\`\`${normalizedLanguage}\n${formattedCode}\n\`\`\``]
        },
        formattingResult ? {
          title: "Linting/Formatting Output",
          content: [`\`\`\`\n${formattingResult}\n\`\`\``]
        } : null,
        similarPatterns.length > 0 ? {
          title: "Similar Coding Patterns",
          content: similarPatterns.map((pattern, index) => 
            `### ${index + 1}. ${pattern.name}\n\n` +
            `${pattern.description}\n\n` +
            (pattern.example ? `Example:\n\`\`\`\n${pattern.example}\n\`\`\`` : '')
          )
        } : null
      ].filter(Boolean);

      return formatResponse({
        title: `Code Review for ${language} Code`,
        sections
      });
    }
  );

  /**
   * Handler for the search_code_snippets tool.
   * Searches for code snippets in the Qdrant vector database.
   */
  server.tool(
    "search_code_snippets",
    "Searches for code snippets in the Qdrant vector database",
    searchSnippetsSchema.shape,
    async (args, extra) => {
      const { query, language = "", limit = 5 } = args;
      try {
        // Ensure query is defined
        if (!query) {
          throw new Error("Query parameter is required");
        }
        
        // Ensure collection exists
        const collectionExists = await ensureCollectionExists();
        if (!collectionExists) {
          throw new Error("Qdrant collection does not exist. Please create it manually with the proper embedding configuration.");
        }
        
        // Build the filter
        const filter: any = {
          must: [
            {
              key: "type",
              match: {
                value: "code_snippet"
              }
            }
          ]
        };
        
        // Add language filter if provided
        if (language) {
          filter.must.push({
            key: "language",
            match: {
              value: language
            }
          });
        }
        
        // Use text search with Qdrant's built-in embedding
        const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, {
          text: query,  // Qdrant will handle the embedding
          filter: filter,
          with_payload: true,
          limit: limit
        });

        // Format results in a more readable way
        const results = response.data.result.map((item: any) => {
          const { id, code, language, description, source, tags, created_at } = item.payload;
          return {
            id,
            score: item.score,
            language,
            description,
            source,
            tags,
            created_at,
            code_preview: code?.substring(0, 200) + (code?.length > 200 ? '...' : '')
          };
        });

        // Generate a more user-friendly response
        let responseText = `# Search Results for "${query}"\n\n`;
        responseText += `Found ${results.length} code snippets matching your query.\n\n`;
        
        if (results.length > 0) {
          results.forEach((result: any, index: number) => {
            responseText += `## ${index + 1}. ${result.description || "Untitled Snippet"} (${result.language})\n\n`;
            responseText += `**Score:** ${result.score.toFixed(2)}\n`;
            responseText += `**Tags:** ${result.tags?.length > 0 ? result.tags.join(', ') : "None"}\n`;
            responseText += `**Created:** ${result.created_at || "Unknown"}\n\n`;
            responseText += "```" + result.language.toLowerCase() + "\n" + result.code_preview + "\n```\n\n";
            responseText += `To view the full snippet, access it at code-snippet://${result.id}\n\n`;
          });
        } else {
          responseText += "No results found. Try a different search query or language filter.\n";
        }

        return formatResponse({
          title: `Search Results for "${query}"`,
          content: [
            `Found ${results.length} code snippets matching your query.`,
            ...results.map((result: any, index: number) => 
              `## ${index + 1}. ${result.description || "Untitled Snippet"} (${result.language})\n\n` +
              `**Score:** ${result.score.toFixed(2)}\n` +
              `**Tags:** ${result.tags?.length > 0 ? result.tags.join(', ') : "None"}\n` +
              `**Created:** ${result.created_at || "Unknown"}\n\n` +
              "```" + result.language.toLowerCase() + "\n" + result.code_preview + "\n```\n\n" +
              `To view the full snippet, access it at code-snippet://${result.id}`
            )
          ]
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error searching code snippets: ${error.message}`);
        }
        throw new Error("An unknown error occurred while searching code snippets.");
      }
    }
  );

  /**
   * Stores information about a dependency in the Qdrant vector database.
   */
  server.tool(
    "store_dependency",
    "Stores information about a dependency in the Qdrant vector database",
    dependencySchema.shape,
    async (args, extra) => {
      const { name, version, language, description = "", usage_example = "", tags = [] } = args;
      try {
        await ensureCollectionExists();
        
        // Create a searchable text for filtering and semantic search
        const searchableText = `${language} dependency ${name} ${version} ${description} ${tags.join(' ')}`;
        
        // Generate a unique ID
        const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        const timestamp = new Date().toISOString();
        
        await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
          points: [{
            id: id,
            payload: { 
              type: "dependency",
              id,
              name,
              version,
              language,
              description,
              usage_example,
              tags,
              created_at: timestamp,
              searchable_text: searchableText
            }
          }]
        });

        return formatResponse({
          title: `✅ Successfully stored ${language} dependency ${name} (${version})`,
          content: [
            `ID: ${id}`,
            `Description: ${description || "N/A"}`,
            `Usage Example: ${usage_example || "N/A"}`,
            `Tags: ${tags.length > 0 ? tags.join(', ') : "None"}`,
            `Created: ${timestamp}`,
            `\nYou can retrieve this dependency later using:`,
            `- search_code_snippets with a relevant query`
          ]
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error storing dependency: ${error.message}`);
        }
        throw new Error("An unknown error occurred while storing dependency.");
      }
    }
  );

  /**
   * Handler for the store_crate_documentation tool.
   * Stores documentation for a Rust crate in the Qdrant vector database.
   */
  server.tool(
    "store_crate_documentation",
    "Stores documentation for a Rust crate in the Qdrant vector database",
    crateDocumentationSchema.shape,
    async (args, extra) => {
      const { name, version = "", documentation, examples = [], tags = [] } = args;
      try {
        await ensureCollectionExists();
        
        const searchableText = `Rust crate ${name} ${version} ${documentation.substring(0, 1000)} ${tags.join(' ')}`;
        const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        const timestamp = new Date().toISOString();
        
        await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
          points: [{
            id: id,
            payload: {
              type: "crate_documentation",
              id,
              name,
              version,
              documentation,
              examples,
              tags,
              created_at: timestamp,
              searchable_text: searchableText
            }
          }]
        });

        return formatResponse({
          title: `✅ Successfully stored documentation for Rust crate ${name}${version ? ` (${version})` : ''}`,
          content: [
            `Examples: ${examples.length} example(s)`,
            `Tags: ${tags.length > 0 ? tags.join(', ') : "None"}`,
            `Created: ${timestamp}`,
            `\nYou can retrieve this documentation later using:`,
            `- get_crate_documentation with the name "${name}"`
          ]
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error storing crate documentation: ${error.message}`);
        }
        throw new Error("An unknown error occurred while storing crate documentation.");
      }
    }
  );

  /**
   * Handler for the get_crate_documentation tool.
   * Retrieves documentation for a Rust crate from the Qdrant vector database.
   */
  server.tool(
    "get_crate_documentation",
    "Retrieves documentation for a Rust crate from the Qdrant vector database",
    {
      name: z.string(),
      version: z.string().optional()
    },
    async (args, extra) => {
      const { name, version = "" } = args;
      try {
        await ensureCollectionExists();
        
        // Build the filter
        const filter: any = {
          must: [
            {
              key: "type",
              match: {
                value: "crate_documentation"
              }
            },
            {
              key: "name",
              match: {
                value: name
              }
            }
          ]
        };
        
        // Add version filter if provided
        if (version) {
          filter.must.push({
            key: "version",
            match: {
              value: version
            }
          });
        }
        
        // Use search with Qdrant
        const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
          filter: filter,
          with_payload: true,
          limit: 1
        });

        if (response.data.result.length === 0) {
        return formatResponse({
          title: `No documentation found for Rust crate ${name}${version ? ` (${version})` : ''}`,
          content: []
        });
        }

        const { documentation, examples, tags, created_at } = response.data.result[0].payload;

        // Generate a more user-friendly response
        let responseText = `# Documentation for Rust Crate: ${name}${version ? ` (${version})` : ''}\n\n`;
        
        responseText += "## Documentation\n\n";
        responseText += documentation + "\n\n";
        
        if (examples && examples.length > 0) {
          responseText += "## Examples\n\n";
          examples.forEach((example: string, index: number) => {
            responseText += `### Example ${index + 1}\n\n`;
            responseText += "```rust\n" + example + "\n```\n\n";
          });
        }
        
        responseText += "## Metadata\n\n";
        responseText += `**Tags:** ${tags?.length > 0 ? tags.join(', ') : "None"}\n`;
        responseText += `**Added:** ${created_at || "Unknown"}\n`;

        return formatResponse({
          title: `Documentation for Rust Crate: ${name}${version ? ` (${version})` : ''}`,
          sections: [
            {
              title: "Documentation",
              content: [documentation]
            },
            examples && examples.length > 0 ? {
              title: "Examples",
              content: examples.map((example: string, index: number) => 
                `### Example ${index + 1}\n\n` +
                "```rust\n" + example + "\n```"
              )
            } : null,
            {
              title: "Metadata",
              content: [
                `**Tags:** ${tags?.length > 0 ? tags.join(', ') : "None"}`,
                `**Added:** ${created_at || "Unknown"}`
              ]
            }
          ].filter(Boolean)
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error retrieving crate documentation: ${error.message}`);
        }
        throw new Error("An unknown error occurred while retrieving crate documentation.");
      }
    }
  );

  /**
   * Handler for the list_notes tool.
   * Lists all available notes.
   */
  server.tool(
    "list_notes",
    "Lists all available notes",
    {},
    async (args, extra) => {
      try {
        // Import notes from resources
        const { notes } = await import("./resources.js");
        
        // Generate a list of all notes
        const notesList = Object.entries(notes).map(([id, note]: [string, any]) => ({
          id,
          title: note.title,
          preview: note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '')
        }));

        // Generate a more user-friendly response
        let responseText = `# Available Notes\n\n`;
        
        if (notesList.length > 0) {
          notesList.forEach((note) => {
            responseText += `## ${note.title} (ID: ${note.id})\n\n`;
            responseText += `${note.preview}\n\n`;
            responseText += `Access with: note://${note.id}\n\n`;
          });
        } else {
          responseText += "No notes available.\n";
        }

        return formatResponse({
          title: "Available Notes",
          sections: notesList.map(note => ({
            title: `${note.title} (ID: ${note.id})`,
            content: [
              note.preview,
              `Access with: note://${note.id}`
            ]
          }))
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error listing notes: ${error.message}`);
        }
        throw new Error("An unknown error occurred while listing notes.");
      }
    }
  );
}
