export const CODE_GENERATION_API = process.env.CODE_GENERATION_API || 'http://localhost:8080/generate';
export const CODE_COMPLETION_API = process.env.CODE_COMPLETION_API || 'http://localhost:8080/complete';
import { promisify } from 'util';
import { exec as _exec } from 'child_process';
import { logger } from './logger.js';
import axios from 'axios';
const { QdrantClient } = await import('@qdrant/js-client-rest');

export const QDRANT_SERVER_URL = process.env.QDRANT_URL || 'http://192.168.3.171:6333';
export const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
export const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || 'http://192.168.3.171:8000/embed';
export const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'mcp';
export const VECTOR_SIZE = parseInt(process.env.QDRANT_VECTOR_SIZE || '768', 10); // all-mpnet-base-v2 produces 768-dimensional vectors

const execPromise = promisify(_exec);

let qdrantClient: InstanceType<typeof QdrantClient> | null = null;

type CodeAnalysisResult = {
  issues: Array<{
    severity: string;
    message: string;
    line?: number | undefined;
    suggestion?: string;
  }>;
  bestPractices: string[];
};

interface SimilarPattern {
  name: string;
  description: string;
  example: string;
}

// Interface matching Qdrant API response
interface SearchResultItem {
  id: string | number;
  version: number;
  score: number;
  payload?: Record<string, unknown> | null;
  vector?: number[] | number[][] | Record<string, unknown> | null;
  shard_key?: string | number | Record<string, unknown> | null;
  order_value?: number | Record<string, unknown> | null;
}

// Helper function for calculating line numbers

export async function getClient(): Promise<InstanceType<typeof QdrantClient> | null> {
  try {
    if (!qdrantClient) {
      logger.info(`Initializing Qdrant client with URL: ${QDRANT_SERVER_URL}`);
      qdrantClient = new QdrantClient({
        url: QDRANT_SERVER_URL,
        apiKey: QDRANT_API_KEY
      });
    }
    return qdrantClient;
  } catch (error) {
    logger.error('Failed to initialize Qdrant client:', error);
    return null;
  }
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    logger.info('Getting embedding for text...');
    const response = await axios.post(EMBEDDING_API_URL, { text });
    if (!response.data || !response.data.embedding || !Array.isArray(response.data.embedding)) {
      throw new Error('Invalid embedding response format');
    }
    return response.data.embedding;
  } catch (error) {
    logger.error('Failed to get embedding:', error);
    return null;
  }
}

export async function ensureCollectionExists(): Promise<boolean> {
  const client = await getClient();
  if (!client) {
    throw new Error('Failed to initialize Qdrant client');
  }
  
  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!exists) {
      logger.info(`Creating collection ${COLLECTION_NAME}`);
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine'
        }
      });
      logger.info(`Collection ${COLLECTION_NAME} created successfully`);
    } else {
      logger.info(`Collection ${COLLECTION_NAME} exists`);
    }

    return true;
  } catch (error) {
    logger.error('Failed to ensure collection exists:', error);
    throw error;
  }
}

import { ESLint } from 'eslint';
import { CodeGenerationParams } from './types.js';

export async function analyzeCode(code: string, language: string): Promise<CodeAnalysisResult> {
  const issues: Array<{ severity: string; message: string; line?: number | undefined; suggestion?: string }> = [];
  const bestPractices: string[] = [];
  
  try {
    const eslint = new ESLint({
      overrideConfigFile: 'eslint.config.js',
    });

    const results = await eslint.lintText(code, {
      filePath: `temp.${language === 'typescript' ? 'ts' : 'js'}`,
    });

    for (const result of results) {
      for (const message of result.messages) {
        issues.push({
          severity: message.severity === 2 ? 'Error' : message.severity === 1 ? 'Warning' : 'Info',
          message: message.message,
          line: message.line,
          suggestion: message.fix ? 'Run ESLint fix' : undefined,
        });
      }
    }

    // Add language-specific best practices
    if (language.toLowerCase() === 'javascript' || language.toLowerCase() === 'typescript') {
      bestPractices.push(
        'Use const/let instead of var',
        'Prefer arrow functions for callbacks',
        'Use strict equality (===) instead of loose equality (==)',
      );
    }

    return { issues, bestPractices };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('ESLint analysis failed:', error);
    return {
      issues: [{ severity: 'Error', message: 'Code analysis failed' }],
      bestPractices: [],
    };
  }
}

export async function formatRustCode(code: string): Promise<{ formattedCode: string; lintOutput: string }> {
  const rustfmtResult = await execPromise(`echo '${code}' | rustfmt`);
  const clippyResult = await execPromise(`echo '${code}' | clippy-driver --print lad`);
  
  return {
    formattedCode: rustfmtResult.stdout.trim(),
    lintOutput: clippyResult.stdout,
  };
}

export async function formatJsCode(code: string): Promise<{ formattedCode: string; lintOutput: string }> {
  const { stdout } = await execPromise(`echo '${code}' | eslint --fix`);
  
  return {
    formattedCode: stdout,
    lintOutput: '',
  };
}

export async function formatPythonCode(code: string): Promise<{ formattedCode: string; lintOutput: string }> {
  const formatterResult = await execPromise(`echo '${code}' | black -`);
  const linterResult = await execPromise(`echo '${formatterResult.stdout}' | flake8 --show-source`);
  
  return {
    formattedCode: formatterResult.stdout,
    lintOutput: linterResult.stdout,
  };
}

export async function findSimilarPatterns(code: string, language: string): Promise<SimilarPattern[]> {
  if (!code.trim()) {
    return [];
  }

  const client = await getClient();
  if (!client) {
    logger.error('Failed to get Qdrant client');
    return [];
  }
  
  try {
    // Get embedding for the code
    const vector = await getEmbedding(code);
    if (!vector) {
      logger.error('Failed to get embedding for code');
      return [];
    }
    
    // Use vector search
    const searchParams = {
      vector: vector,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          {
            key: 'language',
            match: { value: language },
          },
        ],
      },
      limit: 5,
    };

    const response = await client.search(COLLECTION_NAME, searchParams);
    
    return response.map((item: SearchResultItem) => ({
      name: item.payload?.description as string || 'Unnamed snippet',
      description: item.payload?.source as string || 'No source information',
      example: item.payload?.code as string || '',
    })) as SimilarPattern[];
  } catch (error) {
    logger.error('Similar patterns search failed:', error);
    return [];
  }
}

/**
 * Converts a natural language description to a structured
 * prompting format for code generation.
 */
export function createCodeGenerationPrompt(params: CodeGenerationParams): string {
  const { description, language, includeComments, complexity } = params;
  
  return `
Generate ${language} code that ${description}

Requirements:
- Language: ${language}
- Complexity: ${complexity}
- Comments: ${includeComments ? 'Include detailed explanations' : 'Keep comments minimal'}
- Follow ${language} best practices and conventions
- Make the code modular and reusable
- Implement proper error handling

The code should be:
- Well-structured
- Readable
- Efficient
- Secure
- Testable

Additional context:
${complexity === 'simple' ? '- Keep the solution straightforward and focused' : ''}
${complexity === 'moderate' ? '- Balance simplicity and feature completeness' : ''}
${complexity === 'complex' ? '- Implement a comprehensive solution with advanced features' : ''}
  `;
}

/**
 * Analyzes code context to improve completion suggestions
 */
export function analyzeCodeContext(code: string, language: string): {
  language: string;
  length: number;
  imports: string[];
  variables: string[];
  functions: Array<{name: string, params: string[]}>;
  classes: string[];
} {
  // This function would analyze code to provide better completions
  // Detect:
  // - Libraries/frameworks being used
  // - Coding patterns
  // - Variables in scope
  // - Function signatures
  // - Class structures
  
  // For now, we'll return a simplified analysis
  const analysis: {
    language: string;
    length: number;
    imports: string[];
    variables: string[];
    functions: Array<{name: string, params: string[]}>;
    classes: string[];
  } = {
    language,
    length: code.length,
    imports: [] as string[],
    variables: [] as string[],
    functions: [] as Array<{name: string, params: string[]}>,
    classes: [] as string[],
  };
  
  // Detect imports based on language
  if (language === 'javascript' || language === 'typescript') {
    const importRegex = /import\s+?(?:(?:{[^}]+})|(?:[^{}]+?))\s+from\s+?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      analysis.imports.push(match[1]);
    }
    
    // Simple detection of functions
    const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)/g;
    while ((match = functionRegex.exec(code)) !== null) {
      analysis.functions.push({
        name: match[1],
        params: match[2].split(',').map(p => p.trim()),
      });
    }
  } else if (language === 'python') {
    const importRegex = /(?:from\s+(\S+)\s+import)|(?:import\s+([^as]+))/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      analysis.imports.push(match[1] || match[2]);
    }
    
    // Simple detection of functions
    const functionRegex = /def\s+(\w+)\s*\(([^)]*)\)/g;
    while ((match = functionRegex.exec(code)) !== null) {
      analysis.functions.push({
        name: match[1],
        params: match[2].split(',').map(p => p.trim()),
      });
    }
  }
  
  return analysis;
}
