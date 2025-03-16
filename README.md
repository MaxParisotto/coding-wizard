# Coding Wizard MCP Server

A powerful Model Context Protocol (MCP) server that implements a coding assistant leveraging Qdrant Vector DB for storing and retrieving code snippets and other useful information.

## Features

- 🚀 Powerful code generation and completion capabilities
- 📝 Code snippet storage and retrieval using Qdrant Vector DB
- 🔍 Semantic search for code snippets
- 📊 Structured logging system
- ⚙️ Environment-based configuration
- 🛡️ Input validation using Zod
- 🔄 Graceful error handling and shutdown

## Prerequisites

- Node.js >= 18
- Qdrant Vector DB instance
- Embedding service (for vector embeddings)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/coding-wizard.git
   cd coding-wizard
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create environment configuration:

   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration values.

## Configuration

The server can be configured using environment variables. See `.env.example` for all available options:

- `SERVER_NAME`: Name of the MCP server
- `SERVER_VERSION`: Version of the server
- `SERVER_DESCRIPTION`: Description of the server's capabilities
- `QDRANT_URL`: URL of your Qdrant instance
- `QDRANT_COLLECTION`: Name of the Qdrant collection
- `QDRANT_VECTOR_SIZE`: Size of vectors for embeddings
- `EMBEDDING_API_URL`: URL of your embedding service
- `LOG_LEVEL`: Logging level (error, warn, info, http, debug)
- `LOG_DIR`: Directory for log files
- `NODE_ENV`: Environment (development, production, test)

## Development

1. Start in development mode:

   ```bash
   npm run dev
   ```

2. Build the project:

   ```bash
   npm run build
   ```

3. Start in production mode:

   ```bash
   npm start
   ```

4. Run linting:

   ```bash
   npm run lint
   ```

5. Run tests:

   ```bash
   npm test
   ```

## Logging

The server uses a structured logging system with the following features:

- Console output with colored log levels
- File-based logging in the configured `LOG_DIR`
- Separate error log file for error-level messages
- HTTP request logging
- Debug-level logging for development

Log files are stored in:

- `logs/error.log`: Error-level messages
- `logs/combined.log`: All log messages

## Error Handling

The server implements comprehensive error handling:

- Validation of configuration using Zod
- Graceful shutdown on SIGINT and SIGTERM
- Uncaught exception handling
- Unhandled promise rejection handling
- Structured error logging

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
