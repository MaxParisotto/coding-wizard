from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct
import uvicorn
import logging
import os
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Embedding Service",
    description="A service that provides text embeddings using sentence-transformers",
    version="1.0.0"
)

# Initialize the model - using MPNet which produces 768-dimensional vectors
logger.info("Loading model sentence-transformers/all-mpnet-base-v2...")
model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
logger.info("Model loaded successfully")

# Initialize Qdrant client
QDRANT_HOST = os.getenv("QDRANT_HOST", "192.168.3.171")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = "mcp"

logger.info(f"Connecting to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}...")
qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
logger.info("Connected to Qdrant successfully")

# Ensure collection exists
try:
    collections = qdrant_client.get_collections().collections
    collection_names = [c.name for c in collections]
    if COLLECTION_NAME not in collection_names:
        logger.info(f"Creating collection {COLLECTION_NAME}...")
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )
        logger.info("Collection created successfully")
    else:
        logger.info(f"Collection {COLLECTION_NAME} already exists")
except Exception as e:
    logger.error(f"Error setting up Qdrant collection: {str(e)}")
    raise

class TextInput(BaseModel):
    text: str

class CodeSnippet(BaseModel):
    code: str
    language: str = "typescript"
    description: str = ""
    tags: list[str] = []

@app.post("/embed")
async def get_embedding(input: TextInput):
    """
    Generate embeddings for the input text using sentence-transformers.
    Returns 768-dimensional vectors for better code representation.
    """
    try:
        logger.info(f"Processing text: {input.text[:100]}...")
        embedding = model.encode(input.text)
        logger.info(f"Embedding generated successfully - shape: {embedding.shape}")
        return {"embedding": embedding.tolist()}
    except Exception as e:
        logger.error(f"Error generating embedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/store")
async def store_code(snippet: CodeSnippet):
    """
    Store a code snippet in the Qdrant collection.
    """
    try:
        # Generate embedding for the code
        logger.info(f"Generating embedding for code snippet: {snippet.code[:100]}...")
        embedding = model.encode(snippet.code)
        
        # Create a unique ID for the point
        point_id = str(uuid.uuid4())
        
        # Store in Qdrant
        logger.info(f"Storing code snippet with ID {point_id}...")
        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding.tolist(),
                    payload={
                        "code": snippet.code,
                        "language": snippet.language,
                        "description": snippet.description,
                        "tags": snippet.tags
                    }
                )
            ]
        )
        logger.info("Code snippet stored successfully")
        return {"id": point_id, "status": "success"}
    except Exception as e:
        logger.error(f"Error storing code snippet: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
async def search_code(query: str, limit: int = 5):
    """
    Search for similar code snippets using the query text.
    """
    try:
        # Generate embedding for the query
        logger.info(f"Generating embedding for search query: {query}")
        query_vector = model.encode(query)
        
        # Search in Qdrant
        logger.info("Searching for similar code snippets...")
        search_results = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector.tolist(),
            limit=limit
        )
        
        # Format results
        results = []
        for hit in search_results:
            results.append({
                "id": hit.id,
                "score": hit.score,
                "code": hit.payload["code"],
                "language": hit.payload["language"],
                "description": hit.payload["description"],
                "tags": hit.payload["tags"]
            })
        
        logger.info(f"Found {len(results)} matching code snippets")
        return {"results": results}
    except Exception as e:
        logger.error(f"Error searching code snippets: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify the service is running.
    """
    return {
        "status": "healthy", 
        "model": "sentence-transformers/all-mpnet-base-v2",
        "vector_size": 768
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 