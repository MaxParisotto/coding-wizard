import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Import the QdrantClient for both type checking and instantiation
import { QdrantClient } from '@qdrant/js-client-rest';

// Define Note interface
interface Note {
  title: string;
  content: string;
}

export const notes: { [id: string]: Note } = {
  '1': { title: 'First Note', content: 'This is note 1' },
  '2': { title: 'Second Note', content: 'This is note 2' },
};

// Qdrant connection setup with retry logic
let qdrantClient: QdrantClient | null = null;
const COLLECTION_NAME = 'mcp';
const VECTOR_SIZE = 1536;

async function initializeQdrant() {
  let attempt = 0;
  const MAX_ATTEMPTS = 5;
  
  while (attempt < MAX_ATTEMPTS) {
    try {
      if (!qdrantClient) {
        qdrantClient = new QdrantClient({
          url: process.env.QDRANT_URL || 'http://192.168.2.190:6333',
        });
        
        // Check connectivity by making a simple API call
        await qdrantClient.getCollections();
        await ensureCollectionExists();
        await indexAllNotes();
      }
      return;
    } catch {
      const retryAfter = Math.pow(2, attempt + 1) * 1000;
      console.warn(`Qdrant connection failed. Retrying in ${retryAfter/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      attempt++;
    }
  }
  throw new Error('Failed to connect to Qdrant after multiple retries');
}

async function ensureCollectionExists() {
  if (!qdrantClient) throw new Error('Qdrant client not initialized');
  
  try {
    await qdrantClient.getCollection(COLLECTION_NAME);
    console.log(`Collection ${COLLECTION_NAME} exists`);
  } catch {
    console.log(`Creating collection ${COLLECTION_NAME}`);
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
    });
  }
}

// Using the server's embedding functionality
async function getEmbeddingFromServer(text: string): Promise<number[]> {
  // Assuming embedding service is already available via an API endpoint
  const response = await fetch(process.env.EMBEDDING_API_URL || 'http://localhost:8000/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  
  if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
  const data = await response.json();
  return data.embedding;
}

async function indexNote(id: string, note: Note) {
  if (!qdrantClient) throw new Error('Qdrant client not initialized');
  
  const vector = await getEmbeddingFromServer(note.title + ' ' + note.content);
  
  await qdrantClient.upsert(COLLECTION_NAME, {
    wait: true,
    points: [{ id, vector, payload: { title: note.title, content: note.content } }],
  });
}

async function indexAllNotes() {
  for (const [id, note] of Object.entries(notes)) {
    await indexNote(id, note);
  }
}

async function searchSimilarNotes(query: string, limit: number = 5) {
  if (!qdrantClient) throw new Error('Qdrant client not initialized');
  
  const queryVector = await getEmbeddingFromServer(query);
  
  return await qdrantClient.search(COLLECTION_NAME, {
    vector: queryVector,
    limit,
    with_payload: true,
  });
}

async function addOrUpdateNote(id: string, note: Note) {
  notes[id] = note;
  await indexNote(id, note);
  return note;
}

// Auto-init on server startup
initializeQdrant();

export function registerResources(server: McpServer): void {
  // Get a note
  server.resource(
    'note',
    'note://.*',
    async uri => {
      const id = uri.href.replace('note://', '');
      const note = notes[id];
      
      if (!note) throw new Error(`Note ${id} not found`);
      
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/plain',
          text: note.content,
        }],
      };
    },
  );
  
  // Search similar notes
  server.resource(
    'search',
    'search://similar?query=.*',
    async uri => {
      const query = new URL(uri.href).searchParams.get('query') || '';
      const limit = parseInt(new URL(uri.href).searchParams.get('limit') || '5');
      
      const results = await searchSimilarNotes(query, limit);
      
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(results),
        }],
      };
    },
  );
}

export { addOrUpdateNote, searchSimilarNotes };
