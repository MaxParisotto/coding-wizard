import { promisify } from "util";
import axios, { AxiosError } from "axios";
import fs from "fs";
import { exec as _exec } from "child_process";
const { QdrantClient } = await import("@qdrant/js-client-rest");

export const QDRANT_SERVER_URL = process.env.QDRANT_SERVER_URL || 'http://localhost:6333';
export const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'mcp';

const execPromise = promisify(_exec);

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
function getLineFromCharIndex(code: string, charIndex: number): number | undefined {
  const lines = code.slice(0, charIndex).split('\n');
  return lines.length - 1 || undefined; // Handle empty case
}

export async function getClient() {
  return new QdrantClient({
    url: QDRANT_SERVER_URL,
    timeout: 5000
  });
}

export async function ensureCollectionExists(): Promise<boolean> {
  const client = await getClient();
  try {
    await client.getCollection(COLLECTION_NAME);
    return true;
  } catch (error) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 768,
        distance: "Cosine"
      }
    });
  }
  return true;
}

import { ESLint } from 'eslint';

export async function analyzeCode(code: string, language: string): Promise<CodeAnalysisResult> {
  const issues: Array<{ severity: string; message: string; line?: number | undefined; suggestion?: string }> = [];
  const bestPractices: string[] = [];
  
  try {
    const eslint = new ESLint({
      overrideConfigFile: 'eslint.config.js',
    });

    const results = await eslint.lintText(code, {
      filePath: `temp.${language === 'typescript' ? 'ts' : 'js'}`
    });

    for (const result of results) {
      for (const message of result.messages) {
        issues.push({
          severity: message.severity === 2 ? 'Error' : message.severity === 1 ? 'Warning' : 'Info',
          message: message.message,
          line: message.line,
          suggestion: message.fix ? 'Run ESLint fix' : undefined
        });
      }
    }

    // Add language-specific best practices
    if (language.toLowerCase() === 'javascript' || language.toLowerCase() === 'typescript') {
      bestPractices.push(
        "Use const/let instead of var",
        "Prefer arrow functions for callbacks",
        "Use strict equality (===) instead of loose equality (==)"
      );
    }

    return { issues, bestPractices };
  } catch (error) {
    console.error('ESLint analysis failed:', error);
    return {
      issues: [{ severity: 'Error', message: 'Code analysis failed' }],
      bestPractices: []
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
  const client = await getClient();
  
  try {
    const dummyVector = Array(768).fill(0);
    
    const response = await client.search(COLLECTION_NAME, {
      vector: dummyVector,
      limit: 5,
      filter: {
        must: [
          {
            key: "language",
            match: { value: language }
          }
        ]
      }
    });
    
    return response.map((item: SearchResultItem) => ({
      name: item.payload && typeof item.payload.description === 'string' 
        ? item.payload.description 
        : 'Unnamed snippet',
      description: item.payload && typeof item.payload.source === 'string'
        ? item.payload.source
        : 'No source information',
      example: item.payload && typeof item.payload.code === 'string'
        ? item.payload.code
        : ''
    })) as SimilarPattern[];
  } catch (error) {
    console.error('Similar patterns search failed:', error);
    return [];
  }
}
