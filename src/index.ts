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
import axios from "axios";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
        store_data: {
          description: "Store data in the mcp collection",
          inputSchema: {
            type: "object",
            properties: {
              documents: {
                type: "array",
                items: {
                  type: "object"
                },
                description: "Array of documents to store in the collection"
              }
            },
            required: ["documents"]
          }
        },
        retrieve_data: {
          description: "Retrieve data from the mcp collection based on a query",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Query string to search for documents"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (optional)"
              }
            },
            required: ["query"]
          }
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
server.setRequestHandler(ListResourcesRequestSchema, async () => {
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
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const capabilities = (server as any).capabilities;
  return {
    tools: [
      capabilities.tools.store_data,
      capabilities.tools.retrieve_data
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "store_data": {
      if (!request.params.arguments || !Array.isArray(request.params.arguments.documents)) {
        throw new Error("Documents are required");
      }
      const documents = request.params.arguments.documents;

      try {
        await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points`, { points: documents.map((doc, idx) => ({ id: idx + 1, vector: [], payload: doc })) });
        return {
          content: [{
            type: "text",
            text: `Stored ${documents.length} documents in the mcp collection.`
          }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Error storing data: ${error.message}`);
        }
        throw new Error("An unknown error occurred while storing data.");
      }
    }

    case "retrieve_data": {
      if (!request.params.arguments || typeof request.params.arguments.query !== 'string') {
        throw new Error("Query is required");
      }
      const query = request.params.arguments.query;
      const limit = request.params.arguments.limit || 10;

      try {
        const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, { vector: [], filter: {}, params: { query }, limit });
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

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "create_note": {
      const title = String(request.params.arguments?.title);
      const content = String(request.params.arguments?.content);
      if (!title || !content) {
        throw new Error("Title and content are required");
      }

      const id = String(Object.keys(notes).length + 1);
      notes[id] = { title, content };

      return {
        content: [{
          type: "text",
          text: `Created note ${id}: ${title}`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes a single "summarize_notes" prompt that summarizes all notes.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
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
 * Returns a prompt that requests summarization of all notes, with the notes' contents embedded as resources.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
 * This allows the server to communicate via standard input/output streams.
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
console.log(`Qdrant Server URL: ${QDRANT_SERVER_URL}`);
console.log(`Collection Name: ${COLLECTION_NAME}`);
