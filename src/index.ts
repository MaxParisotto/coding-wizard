#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { store_code_snippet_schema, store_dependency_schema, store_crate_documentation_schema, search_code_snippets_schema, get_crate_documentation_schema } from "./schemas.js";

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
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
 */
const QDRANT_SERVER_URL = process.env.QDRANT_SERVER_URL || "http://192.168.2.190:6333";
const COLLECTION_NAME = "mcp";

const server = new Server(
  {
    name: "coding-wizard",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {
        store_code_snippet: {
          description: "Store a Rust code snippet in Qdrant.",
          inputSchema: store_code_snippet_schema
        },
        store_dependency: {
          description: "Store a dependency for a Rust project in Qdrant.",
          inputSchema: store_dependency_schema
        },
        store_crate_documentation: {
          description: "Store crate documentation details in Qdrant.",
          inputSchema: store_crate_documentation_schema
        },
        search_code_snippets: {
          description: "Search for code snippets by keyword or tag.",
          inputSchema: search_code_snippets_schema
        },
        get_crate_documentation: {
          description: "Retrieve crate documentation details by name.",
          inputSchema: get_crate_documentation_schema
        }
      },
      prompts: {},
    },
  }
);

/**
 * Handler for listing available notes as resources.
 * Each note is exposed as a resource with:
 * - A note:// URI scheme
 * - Plain text MIME type
 * - Human readable name and description (now including the note title)
 */
server.setRequestHandler(ListResourcesRequestSchema, async (request: any) => {
  return {
    resources: Object.entries(notes).map(([id, note]) => ({
      uri: `note:///${id}`,
      mimeType: "text/plain",
      name: note.title,
      description: `A text note: ${note.title}`
    }))
  };
});

/**
 * Handler for reading the contents of a specific note.
 * Takes a note:// URI and returns the note content as plain text.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
  const url = new URL(request.params.uri);
  const id = url.pathname.replace(/^\//, '');
  const note = notes[id];

  if (!note) {
    throw new Error(`Note ${id} not found`);
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/plain",
      text: note.content
    }]
  };
});

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async (request: any) => {
  const capabilities = (server as any).capabilities;
  return {
    tools: [
      capabilities.tools.store_code_snippet,
      capabilities.tools.store_dependency,
      capabilities.tools.store_crate_documentation,
      capabilities.tools.search_code_snippets,
      capabilities.tools.get_crate_documentation,
      {
        name: "list_notes",
        description: "List all notes with details",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ]
  };
});

/**
 * Handler for the store_code_snippet tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "store_code_snippet") {
    throw new Error("Unknown tool");
  }

  const { code, language = "Rust", description, source, tags } = request.params.arguments;

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
});

/**
 * Handler for the store_dependency tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "store_dependency") {
    throw new Error("Unknown tool");
  }

  const { dependency_name, version, repository_url, description } = request.params.arguments;

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
});

/**
 * Handler for the store_crate_documentation tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "store_crate_documentation") {
    throw new Error("Unknown tool");
  }

  const { crate_name, documentation_url, version, repository_url } = request.params.arguments;

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
});

/**
 * Handler for the search_code_snippets tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "search_code_snippets") {
    throw new Error("Unknown tool");
  }

  const { query } = request.params.arguments;

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
});

/**
 * Handler for the get_crate_documentation tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "get_crate_documentation") {
    throw new Error("Unknown tool");
  }

  const { crate_name } = request.params.arguments;

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
});

/**
 * Handler for the list_notes tool.
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "list_notes") {
    throw new Error("Unknown tool");
  }

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
});

/**
 * Handler that lists available prompts.
 */
server.setRequestHandler(ListPromptsRequestSchema, async (request: any) => {
  return {
    prompts: [
      {
        name: "summarize_notes",
        description: "Summarize all notes",
      }
    ]
  };
});

/**
 * Handler for the summarize_notes prompt.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
  if (request.params.name !== "summarize_notes") {
    throw new Error("Unknown prompt");
  }

  const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
    type: "resource" as const,
    resource: {
      uri: `note:///${id}`,
      mimeType: "text/plain",
      text: note.content
    }
  }));

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please summarize the following notes:"
        }
      },
      ...embeddedNotes.map(note => ({
        role: "user" as const,
        content: note
      })),
      {
        role: "user",
        content: {
          type: "text",
          text: "Provide a concise summary of all the notes above."
        }
      }
    ]
  };
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await (server as any).connect(transport);
}

main().catch((error) => {
  console.error("Server error:", (error as any).message);
  process.exit(1);
});

// Add logging for the Qdrant server URL and collection name
console.log(`Qdrant Server URL: ${QDRANT_SERVER_URL}`);
console.log(`Collection Name: ${COLLECTION_NAME}`);
