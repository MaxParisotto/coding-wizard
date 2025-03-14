/**
 * Resource handlers for the coding-wizard MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Note } from "./types";

/**
 * Simple in-memory storage for notes.
 * In a real implementation, this would likely be backed by a database.
 */
export const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

/**
 * Register resource handlers with the server
 */
export function registerResources(server: McpServer): void {
  /**
   * Handler for notes as resources.
   */
  server.resource(
    "note",
    "note://.*",
    async (uri) => {
      // Extract the ID from the URI
      // URI format is note://ID
      const id = uri.href.replace('note://', '');
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
}
