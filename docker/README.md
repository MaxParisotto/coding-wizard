# Docker Setup for Qdrant and Embedding Service

This directory contains the Docker configuration for running Qdrant vector database and its companion embedding service.

## Components

- `docker-compose.yml` - Defines the services configuration
- `embedding.Dockerfile` - Builds the embedding service container
- `embedding_server.py` - FastAPI server for text embeddings

## Requirements

- Docker
- Docker Compose
- At least 4GB of RAM (recommended)
- About 2GB of disk space for the model and Docker images

## Installation

1. Copy this directory to your server:

   ```bash
   scp -r docker/ user@your-server:/path/to/destination/
   ```

2. SSH into your server:

   ```bash
   ssh user@your-server
   ```

3. Navigate to the docker directory:

   ```bash
   cd /path/to/destination/docker
   ```

4. Start the services:

   ```bash
   docker-compose up -d
   ```

## Service URLs

- Qdrant: <http://localhost:6333>
- Embedding Service: <http://localhost:8000>

## API Endpoints

### Embedding Service

- `POST /embed`
  - Input: `{"text": "your text here"}`
  - Output: `{"embedding": [...]}`

- `GET /health`
  - Health check endpoint

### Qdrant

- Default Qdrant endpoints available at port 6333
- See [Qdrant HTTP API Reference](https://qdrant.tech/documentation/quick_start/) for details

## Monitoring

View logs:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f embedding_service
docker-compose logs -f qdrant
```

## Data Persistence

Qdrant data is stored in a Docker volume named `qdrant_storage`. This ensures your data persists across container restarts.

## Stopping Services

```bash
docker-compose down
```

## Troubleshooting

1. If the embedding service fails to start, check the logs:

   ```bash
   docker-compose logs embedding_service
   ```

2. If you need to rebuild the embedding service:

   ```bash
   docker-compose build --no-cache embedding_service
   ```

3. To check if services are healthy:

   ```bash
   docker-compose ps
   ```
