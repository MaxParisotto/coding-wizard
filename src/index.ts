#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { promisify } from "util";
import axios from "axios";
import fs from "fs";
import { exec as _exec } from "child_process";
const exec = promisify(_exec);
import { z } from "zod";
import { QDRANT_SERVER_URL, COLLECTION_NAME } from "./config.js";

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
  "note:///.*",
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
 * Handler for the store_code_snippet tool.
 */
server.tool(
  "store_code_snippet",
  { code: z.string(), language: z.string().optional(), description: z.string().optional(), source: z.string().optional(), tags: z.array(z.string()).optional() },
  async ({ code, language = "Rust", description, source, tags }) => {
    try {
      await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [{
          id: Math.floor(Math.random() * 10000),
          vector: [],
          payload: { code, language, description, source, tags }
        }]
      });

      return {
        content: [{
          type: "text",
          text: `Stored Rust code snippet in the mcp collection.`
        }]
      };
    } catch (error) {
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
  { code: z.string() },
  async ({ code }) => {
    const tempFilePath = '/tmp/code_review.rs';
    fs.writeFileSync(tempFilePath, code);

    // Run rustfmt to format the code
    let rustfmtOutput = '';
    try {
      rustfmtOutput = await new Promise((resolve, reject) => {
        exec(`rustfmt ${tempFilePath}`, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        });
      });
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error formatting code with rustfmt: ${(error as Error).message}`
        }],
        isError: true
      };
    }

    // Run clippy-driver to lint the code
    let clippyOutput = '';
    try {
      clippyOutput = await new Promise((resolve, reject) => {
        exec(`clippy-driver --input-format=auto --emit=json ${tempFilePath}`, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        });
      });
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error linting code with clippy-driver: ${(error as Error).message}`
        }],
        isError: true
      };
    }

    // Read the formatted code
    const formattedCode = fs.readFileSync(tempFilePath, 'utf8');
    fs.unlinkSync(tempFilePath);

    return {
      content: [{
        type: "text",
        text: `Formatted Code:\n${formattedCode}\n\nClippy Output:\n${clippyOutput}`
      }]
    };
  }
);

/**
 * Handler for the store_dependency tool.
 */
server.tool(
  "store_dependency",
  { dependency_name: z.string(), version: z.string().optional(), repository_url: z.string().optional(), description: z.string().optional() },
  async ({ dependency_name, version, repository_url, description }) => {
    try {
      await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [{
          id: Math.floor(Math.random() * 10000),
          vector: [],
          payload: { dependency_name, version, repository_url, description }
        }]
      });

      return {
        content: [{
          type: "text",
          text: `Stored dependency in the mcp collection.`
        }]
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error storing data: ${error.message}`);
      }
      throw new Error("An unknown error occurred while storing data.");
    }
  }
);

/**
 * Handler for the store_crate_documentation tool.
 */
server.tool(
  "store_crate_documentation",
  { crate_name: z.string(), documentation_url: z.string().optional(), version: z.string().optional(), repository_url: z.string().optional() },
  async ({ crate_name, documentation_url, version, repository_url }) => {
    try {
      await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [{
          id: Math.floor(Math.random() * 10000),
          vector: [],
          payload: { crate_name, documentation_url, version, repository_url }
        }]
      });

      return {
        content: [{
          type: "text",
          text: `Stored crate documentation in the mcp collection.`
        }]
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error storing data: ${error.message}`);
      }
      throw new Error("An unknown error occurred while storing data.");
    }
  }
);

/**
 * Handler for the search_code_snippets tool.
 */
server.tool(
  "search_code_snippets",
  { query: z.string() },
  async ({ query }) => {
    try {
      const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, {
        vector: [],
        filter: {},
        params: { search: query },
        limit: 10
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error retrieving data: ${error.message}`);
      }
      throw new Error("An unknown error occurred while retrieving data.");
    }
  }
);

/**
 * Handler for the get_crate_documentation tool.
 */
server.tool(
  "get_crate_documentation",
  { crate_name: z.string() },
  async ({ crate_name }) => {
    try {
      const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, {
        vector: [],
        filter: {},
        params: { search: `crate_name: ${crate_name}` },
        limit: 1
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error retrieving data: ${error.message}`);
      }
      throw new Error("An unknown error occurred while retrieving data.");
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", (error as any).message);
  process.exit(1);
});

// Add logging for the Qdrant server URL and collection name
console.log(`Qdrant Server URL: ${process.env.QDRANT_SERVER_URL}`);
console.log(`Collection Name: ${process.env.COLLECTION_NAME}`);
