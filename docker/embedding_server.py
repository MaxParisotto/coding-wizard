from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn
import logging

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

class TextInput(BaseModel):
    text: str

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