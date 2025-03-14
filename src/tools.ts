/**
 * Tool handlers for the coding-wizard MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { CodeAnalysisResult, SimilarPattern } from "./types";
import { 
  ensureCollectionExists, 
  analyzeCode, 
  formatRustCode, 
  formatJsCode, 
  formatPythonCode, 
  findSimilarPatterns,
  QDRANT_SERVER_URL,
  COLLECTION_NAME
} from "./utils";

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
    {}, // Use empty object for the schema to avoid validation issues
    async ({ code, language = "JavaScript", description = "", source = "", tags = [] }) => {
      try {
        // Ensure code is defined
        if (!code) {
          throw new Error("Code parameter is required");
        }
        
        // Ensure collection exists
        await ensureCollectionExists();
        
        // Create a searchable text for filtering and semantic search
        const searchableText = `${language} ${description} ${source} ${tags.join(' ')} ${code.substring(0, Math.min(1000, code.length))}`;
        
        // Generate a unique ID
        const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        const timestamp = new Date().toISOString();
        
        await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
          points: [{
            id: id,
            // The vector field is handled by Qdrant's text embedding capability
            payload: { 
              type: "code_snippet",
              id,
              code, 
              language, 
              description, 
              source, 
              tags,
              created_at: timestamp,
              searchable_text: searchableText
            }
          }]
        });

        return {
          content: [{
            type: "text",
            text: `✅ Successfully stored ${language} code snippet with ID ${id}

Description: ${description || "N/A"}
Tags: ${tags.length > 0 ? tags.join(', ') : "None"}
Source: ${source || "N/A"}
Created: ${timestamp}

You can retrieve this snippet later using:
- search_code_snippets with a relevant query`
          }]
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error storing data: ${error.message}`);
        }
        throw new Error("An unknown error occurred while storing data.");
      }
    }
  );

  /**
   * Handler for the code_review tool.
   * Provides code review and suggestions for multiple programming languages.
   */
  server.tool(
    "code_review",
    {}, // Use empty object for the schema to avoid validation issues
    async ({ code, language }) => {
      try {
        // Ensure language is defined and normalize it
        if (!language) {
          throw new Error("Language parameter is required");
        }
        const normalizedLanguage = language.toLowerCase();
        
        // Basic code analysis for common issues
        const analysis = analyzeCode(code, normalizedLanguage);
        
        // Format the code if possible
        let formattedCode = code;
        let formattingResult = "";
        
        // Language-specific formatting and linting
        if (normalizedLanguage === "rust") {
          const rustResult = await formatRustCode(code);
          formattedCode = rustResult.formattedCode;
          formattingResult = rustResult.lintOutput;
        } else if (normalizedLanguage === "javascript" || normalizedLanguage === "typescript") {
          const jsResult = await formatJsCode(code, normalizedLanguage);
          formattedCode = jsResult.formattedCode;
          formattingResult = jsResult.lintOutput;
        } else if (normalizedLanguage === "python") {
          const pythonResult = await formatPythonCode(code);
          formattedCode = pythonResult.formattedCode;
          formattingResult = pythonResult.lintOutput;
        }
        
        // Find similar code patterns in the database
        const similarPatterns = await findSimilarPatterns(code, normalizedLanguage);
        
        // Generate the response
        let responseText = `# Code Review for ${language} Code\n\n`;
        
        // Add code analysis
        responseText += "## Analysis\n\n";
        if (analysis.issues.length > 0) {
          responseText += "Issues found:\n\n";
          analysis.issues.forEach((issue, index) => {
            responseText += `${index + 1}. **${issue.severity}**: ${issue.message}\n`;
            if (issue.suggestion) {
              responseText += `   - Suggestion: ${issue.suggestion}\n`;
            }
            if (issue.line) {
              responseText += `   - Line: ${issue.line}\n`;
            }
            responseText += "\n";
          });
        } else {
          responseText += "No major issues found in the basic analysis.\n\n";
        }
        
        // Add best practices
        responseText += "## Best Practices\n\n";
        analysis.bestPractices.forEach((practice, index) => {
          responseText += `${index + 1}. ${practice}\n`;
        });
        responseText += "\n";
        
        // Add formatted code
        responseText += "## Formatted Code\n\n";
        responseText += "```" + normalizedLanguage + "\n" + formattedCode + "\n```\n\n";
        
        // Add linting/formatting output if available
        if (formattingResult) {
          responseText += "## Linting/Formatting Output\n\n";
          responseText += "```\n" + formattingResult + "\n```\n\n";
        }
        
        // Add similar patterns if found
        if (similarPatterns.length > 0) {
          responseText += "## Similar Coding Patterns\n\n";
          similarPatterns.forEach((pattern, index) => {
            responseText += `### ${index + 1}. ${pattern.name}\n\n`;
            responseText += `${pattern.description}\n\n`;
            if (pattern.example) {
              responseText += "Example:\n```\n" + pattern.example + "\n```\n\n";
            }
          });
        }
        
        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error reviewing code: ${error.message}`);
        }
        throw new Error("An unknown error occurred during code review.");
      }
    }
  );

  /**
   * Handler for the search_code_snippets tool.
   * Searches for code snippets in the Qdrant vector database.
   */
  server.tool(
    "search_code_snippets",
    {}, // Use empty object for the schema to avoid validation issues
    async ({ query, language = "", limit = 5 }: { query: string; language?: string; limit?: number }) => {
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

        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error searching code snippets: ${error.message}`);
        }
        throw new Error("An unknown error occurred while searching code snippets.");
      }
    }
  );

  /**
   * Handler for the store_dependency tool.
   * Stores information about a dependency in the Qdrant vector database.
   */
  server.tool(
    "store_dependency",
    {}, // Use empty object for the schema to avoid validation issues
    async ({ name, version, language, description = "", usage_example = "", tags = [] }) => {
      try {
        // Ensure collection exists
        await ensureCollectionExists();
        
        // Create a searchable text for filtering and semantic search
        const searchableText = `${language} dependency ${name} ${version} ${description} ${tags.join(' ')}`;
        
        // Generate a unique ID
        const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        const timestamp = new Date().toISOString();
        
        await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
          points: [{
            id: id,
            // The vector field is handled by Qdrant's text embedding capability
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

        return {
          content: [{
            type: "text",
            text: `✅ Successfully stored ${language} dependency ${name} (${version}) with ID ${id}

Description: ${description || "N/A"}
Tags: ${tags.length > 0 ? tags.join(', ') : "None"}
Created: ${timestamp}

You can retrieve this dependency information later using:
- search_dependencies with a relevant query`
          }]
        };
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
    {}, // Use empty object for the schema to avoid validation issues
    async ({ name, version, documentation, examples = [], tags = [] }) => {
      try {
        // Ensure collection exists
        await ensureCollectionExists();
        
        // Create a searchable text for filtering and semantic search
        const searchableText = `Rust crate ${name} ${version} ${documentation.substring(0, 1000)} ${tags.join(' ')}`;
        
        // Generate a unique ID
        const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        const timestamp = new Date().toISOString();
        
        await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
          points: [{
            id: id,
            // The vector field is handled by Qdrant's text embedding capability
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

        return {
          content: [{
            type: "text",
            text: `✅ Successfully stored documentation for Rust crate ${name} (${version}) with ID ${id}

Examples: ${examples.length} example(s)
Tags: ${tags.length > 0 ? tags.join(', ') : "None"}
Created: ${timestamp}

You can retrieve this documentation later using:
- get_crate_documentation with the crate name`
          }]
        };
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
    {}, // Use empty object for the schema to avoid validation issues
    async ({ name, version = "" }) => {
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
          return {
            content: [{
              type: "text",
              text: `No documentation found for Rust crate ${name}${version ? ` (${version})` : ''}.`
            }]
          };
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

        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
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
    {}, // Use empty object for the schema to avoid validation issues
    async () => {
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

        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(`Error listing notes: ${error.message}`);
        }
        throw new Error("An unknown error occurred while listing notes.");
      }
    }
  );
}
