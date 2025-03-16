FROM qdrant/qdrant:latest

# Install Python and required packages
RUN apt-get update && apt-get install -y \
    python3-full \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create and activate a virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install required Python packages within the virtual environment
RUN /opt/venv/bin/pip install \
    sentence-transformers \
    fastapi \
    uvicorn \
    pydantic

# Download and cache the model
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

# Create the embedding service script
COPY embedding_server.py /app/
WORKDIR /app

# Ensure the environment is maintained when the container runs
ENV PYTHONPATH=/opt/venv/lib/python3.11/site-packages

# Expose ports for both Qdrant and embedding service
EXPOSE 6333 6334 8000

# Create startup script
RUN echo '#!/bin/bash\n\
/opt/venv/bin/uvicorn embedding_server:app --host 0.0.0.0 --port 8000 &\n\
./qdrant' > /app/start.sh && \
    chmod +x /app/start.sh

# Set the entry point to our startup script
ENTRYPOINT ["/app/start.sh"] 