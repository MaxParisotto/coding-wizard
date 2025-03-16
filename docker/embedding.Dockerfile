FROM python:3.11-slim

# Install required system packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create and activate a virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install required Python packages
RUN pip install --no-cache-dir \
    sentence-transformers \
    fastapi \
    uvicorn \
    pydantic

# Create app directory
WORKDIR /app

# Copy the embedding service script
COPY embedding_server.py .

# Download and cache the model during build
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

# Expose the service port
EXPOSE 8000

# Start the FastAPI server
CMD ["uvicorn", "embedding_server:app", "--host", "0.0.0.0", "--port", "8000"] 