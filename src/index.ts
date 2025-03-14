#!/usr/bin/env node

/**
 * This is a template MCP server that implements a powerful code assistant using Qdrant Vector DB to store and retrieve useful information
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { promisify } from "util";
import axios from "axios";
import fs from "fs";
import { exec as _exec } from "child_process";
const exec = promisify(_exec);

// Configuration from environment variables with defaults
const QDRANT_SERVER_URL = process.env.QDRANT_SERVER_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'mcp';

const server = new McpServer({
  name: "coding-wizard",
  version: "0.1.0"
});

/**
 * Type alias for a note object.
 */
type Note = { title: string, content: string };

/**
 * Simple in-memory storage for notes.
 * In a real implementation, this would likely be backed by a database.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

/**
 * Handler for listing available notes as resources.
 * Each note is exposed as a resource with:
 * - A note:// URI scheme
 * - Plain text MIME type
 * - Human readable name and description (now including the note title)
 */
server.resource(
  "note",
  "note://.*",
  async (uri) => {
    const url = new URL(uri.href);
    const id = url.pathname.replace(/^\//, '');
    const note = notes[id];

    if (!note) {
      throw new Error(`Note ${id} not found`);
    }

    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: note.content
      }]
    };
  }
);

/**
 * Helper function to ensure Qdrant collection exists
 */
async function ensureCollectionExists(): Promise<boolean> {
  try {
    // Check if collection exists
    await axios.get(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}`);
    console.log(`Collection ${COLLECTION_NAME} exists`);
    return true;
  } catch (error: unknown) {
    // If collection doesn't exist, create it
    if (axios.isAxiosError(error) && error.response && error.response.status === 404) {
      try {
        // For a production environment, we'd let the administrator set up the collection
        // with the proper embedding configuration beforehand
        console.error(`Collection ${COLLECTION_NAME} does not exist. Please create it manually with the proper embedding configuration.`);
        return false;
      } catch (createError: unknown) {
        console.error(`Failed to create collection: ${createError instanceof Error ? createError.message : String(createError)}`);
        return false;
      }
    } else {
      console.error(`Error checking collection: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

/**
 * Handler for the store_code_snippet tool.
 */
server.tool(
  "store_code_snippet",
  {}, // Use empty object for the schema to avoid validation issues
  async ({ code, language = "Rust", description = "", source = "", tags = [] }) => {
    try {
      // Ensure collection exists
      await ensureCollectionExists();
      
      // Create a searchable text for filtering
      const searchableText = `${language} ${description} ${source} ${tags.join(' ')} ${code.substring(0, 1000)}`;
      
      // Generate a unique ID
      const id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
      
      await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [{
          id: id,
          // The vector field is handled by Qdrant's text embedding capability
          payload: { 
            code, 
            language, 
            description, 
            source, 
            tags,
            searchable_text: searchableText
          }
        }]
      });

      return {
        content: [{
          type: "text",
          text: `Stored ${language} code snippet with ID ${id} in the ${COLLECTION_NAME} collection.`
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
 */
server.tool(
  "code_review",
  {}, // Use empty object for the schema to avoid validation issues
  async ({ code, language = "Rust" }) => {
    // For now, we'll focus on Rust review since that's what the original code was doing
    if (language.toLowerCase() !== "rust") {
      return {
        content: [{
          type: "text",
          text: `Code review is currently only supported for Rust. Received ${language} code.`
        }]
      };
    }
    
    const tempFilePath = '/tmp/code_review.rs';
    fs.writeFileSync(tempFilePath, code);

    try {
      // Check if rustfmt is available
      await exec("which rustfmt");
    } catch (error: unknown) {
      return {
        content: [{
          type: "text",
          text: `Error: rustfmt not found. Please install Rust tools to use code review functionality.`
        }],
        isError: true
      };
    }

    // Run rustfmt to format the code
    let formattedCode = code; // Default to original code
    try {
      await exec(`rustfmt ${tempFilePath}`);
      formattedCode = fs.readFileSync(tempFilePath, 'utf8');
    } catch (error: unknown) {
      console.error(`Error formatting code: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with the review even if formatting fails
    }

    // Try to run clippy if available
    let clippyOutput = '';
    try {
      await exec("which clippy-driver");
      const { stdout, stderr } = await exec(`clippy-driver --input-format=auto --emit=json ${tempFilePath}`);
      clippyOutput = stdout || stderr;
    } catch (error: unknown) {
      clippyOutput = `Clippy analysis failed or not available: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Clean up the temp file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (error: unknown) {
      console.error(`Error removing temp file: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      content: [{
        type: "text",
        text: `## Formatted Code\n\`\`\`rust\n${formattedCode}\n\`\`\`\n\n## Clippy Analysis\n${clippyOutput || "No issues found or clippy not available."}`
      }]
    };
  }
);

/**
 * Handler for the store_dependency tool.
 */
server.tool(
  "store_dependency",
  {}, // Use empty object for the schema to avoid validation issues
  async ({ dependency_name, version = "latest", repository_url = "", description = "" }) => {
    try {
      await ensureCollectionExists();
      
      const searchableText = `dependency ${dependency_name} ${version} ${description}`;
      const id = "dep_" + Date.now().toString() + Math.floor(Math.random() * 10000).toString();
      
      await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [{
          id: id,
          // The vector field is handled by Qdrant's text embedding capability
          payload: { 
            type: "dependency",
            dependency_name, 
            version, 
            repository_url, 
            description,
            searchable_text: searchableText
          }
        }]
      });

      return {
        content: [{
          type: "text",
          text: `Stored dependency "${dependency_name}" (${version}) in the ${COLLECTION_NAME} collection.`
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
 */
server.tool(
  "store_crate_documentation",
  {}, // Use empty object for the schema to avoid validation issues
  async ({ crate_name, documentation_url = "", version = "latest", repository_url = "" }) => {
    try {
      await ensureCollectionExists();
      
      const searchableText = `crate documentation ${crate_name} ${version}`;
      const id = "doc_" + Date.now().toString() + Math.floor(Math.random() * 10000).toString();
      
      await axios.put(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [{
          id: id,
          // The vector field is handled by Qdrant's text embedding capability
          payload: { 
            type: "crate_documentation",
            crate_name, 
            documentation_url, 
            version, 
            repository_url,
            searchable_text: searchableText
          }
        }]
      });

      return {
        content: [{
          type: "text",
          text: `Stored documentation for crate "${crate_name}" (${version}) in the ${COLLECTION_NAME} collection.`
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
 * Handler for the search_code_snippets tool.
 */
server.tool(
  "search_code_snippets",
  {}, // Use empty object for the schema to avoid validation issues
  async ({ query, limit = 5 }) => {
    try {
      await ensureCollectionExists();
      
      // Use text search with Qdrant's built-in embedding
      const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, {
        text: query,  // Qdrant will handle the embedding
        filter: {
          must: [
            {
              has_field: "searchable_text"
            }
          ]
        },
        with_payload: true,
        limit: limit
      });

      // Format results in a more readable way
      const results = response.data.result.map((item: any) => {
        const { code, language, description, source, tags } = item.payload;
        return {
          id: item.id,
          score: item.score,
          language,
          description,
          source,
          tags,
          code_preview: code?.substring(0, 200) + (code?.length > 200 ? '...' : '')
        };
      });

      return {
        content: [{
          type: "text",
          text: `Found ${results.length} results for "${query}":\n\n${JSON.stringify(results, null, 2)}`
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
 * Handler for the get_crate_documentation tool.
 */
server.tool(
  "get_crate_documentation",
  {}, // Use empty object for the schema to avoid validation issues
  async ({ crate_name }) => {
    try {
      await ensureCollectionExists();
      
      // Use text search with Qdrant's built-in embedding
      const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, {
        text: `crate documentation ${crate_name}`,  // Qdrant will handle the embedding
        filter: {
          must: [
            {
              key: "type",
              match: {
                value: "crate_documentation"
              }
            },
            {
              key: "crate_name",
              match: {
                value: crate_name
              }
            }
          ]
        },
        limit: 1
      });

      if (response.data.result.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No documentation found for crate "${crate_name}"`
          }]
        };
      }

      const doc = response.data.result[0].payload;
      return {
        content: [{
          type: "text",
          text: `Documentation for ${crate_name} (${doc.version}):\n` +
                `- Documentation URL: ${doc.documentation_url || "N/A"}\n` +
                `- Repository: ${doc.repository_url || "N/A"}`
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
 */
server.tool(
  "list_notes",
  {},
  async () => {
    const detailedNotes = Object.entries(notes).map(([id, note]) => ({
      id,
      title: note.title,
      content: note.content
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify(detailedNotes, null, 2)
      }]
    };
  }
);

/**
 * Start the server using stdio transport.
 */
async function main() {
  console.log(`Starting coding-wizard MCP server...`);
  console.log(`Using Qdrant Server URL: ${QDRANT_SERVER_URL}`);
  console.log(`Using Collection Name: ${COLLECTION_NAME}`);
  
  try {
    // Check if Qdrant server is reachable
    await axios.get(`${QDRANT_SERVER_URL}/collections`);
    console.log("Successfully connected to Qdrant server");
  } catch (error: unknown) {
    console.warn(`Warning: Could not connect to Qdrant server: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("The MCP will start, but vector database operations may fail");
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("MCP server started and connected to transport");
}

main().catch((error: unknown) => {
  console.error("Server error:", (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
