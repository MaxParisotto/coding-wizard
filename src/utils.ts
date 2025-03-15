import { promisify } from "util";
import axios, { AxiosError } from "axios";
import fs from "fs";
import { exec as _exec } from "child_process";

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

// New interface for Qdrant search results
interface SearchResultItem {
  payload?: {
    description?: string;
    source?: string;
    code?: string;
  };
}

// Helper function for calculating line numbers
function getLineFromCharIndex(code: string, charIndex: number): number | undefined {
  const lines = code.slice(0, charIndex).split('\n');
  return lines.length - 1 || undefined; // Handle empty case
}

export async function getClient() {
  const qdrantClient = require("qdrant-client").Client;
  return new qdrantClient({
    url: QDRANT_SERVER_URL,
    timeout: 5000,
    maxRetries: 3,
  });
}

export async function ensureCollectionExists(): Promise<boolean> {
  const client = await getClient();
  try {
    await client.getCollection(COLLECTION_NAME);
    return true;
  } catch (error) {
    await client.createCollection({
      name: COLLECTION_NAME,
      vectors_config: {
        config: { type: "text", params: { models: ["multi-qa-mpnet-base-cv2__en"] } },
      },
    });
  }
  return true;
}

export function analyzeCode(code: string, language: string): CodeAnalysisResult {
  const issues: Array<{ severity: string; message: string; line?: number | undefined }> = [];
  let bestPractices: string[] = [];

  try {
    new Function(code); // Basic syntax check
  } catch (error) { 
    const err = error as any;
    if ('lineNumber' in err && typeof err.lineNumber === 'number') {
      const line = getLineFromCharIndex(
        code,
        err.lineNumber - 1 // Adjust for zero-based indexing?
      );
      issues.push({
        severity: "Error",
        message: `Syntax error in ${language} code: ${err.message}`,
        line: line
      });
    } else {
      issues.push({ severity: "Error", message: `Unknown syntax error` });
    }
  }

  if (language.toLowerCase() === 'javascript') {
    bestPractices = [
      "Avoid var declarations where possible",
      "Use type annotations for clarity"
    ];
  } else if (language.toLowerCase() === 'python') {
    bestPractices = [
      "Use type hints for functions",
      "Follow PEP8 naming conventions"
    ];
  }

  return { issues, bestPractices };
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
    
    const response = await client.search(
      COLLECTION_NAME,
      { vector: dummyVector },
      { limit: 5, filter: { must: [{ key: "language", match: { value: language } }] } }
    );
    
    return (response.result || []).map((item: SearchResultItem) => ({
      name: item.payload?.description ?? 'Unnamed snippet',
      description: item.payload?.source ?? 'No source information',
      example: item.payload?.code ?? ''
    })) as SimilarPattern[];
  } catch (error) {
    console.error('Similar patterns search failed:', error);
    return [];
  }
}
