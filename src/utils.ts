/**
 * Utility functions for the coding-wizard MCP server
 */
import { promisify } from "util";
import axios from "axios";
import fs from "fs";
import { exec as _exec } from "child_process";
import { CodeAnalysisResult, CodeFormattingResult, SimilarPattern } from "./types";

const exec = promisify(_exec);

// Configuration from environment variables with defaults
export const QDRANT_SERVER_URL = process.env.QDRANT_SERVER_URL || 'http://localhost:6333';
export const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'mcp';

/**
 * Helper function to ensure Qdrant collection exists
 */
export async function ensureCollectionExists(): Promise<boolean> {
  try {
    // Check if collection exists
    await axios.get(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}`);
    console.log(`Collection ${COLLECTION_NAME} exists`);
    return true;
  } catch (error: unknown) {
    // If collection doesn't exist, create it
    if (axios.isAxiosError(error) && error.response && error.response.status === 404) {
      try {
        // For a production environment, we'd let the administrator set up the collection
        // with the proper embedding configuration beforehand
        console.error(`Collection ${COLLECTION_NAME} does not exist. Please create it manually with the proper embedding configuration.`);
        return false;
      } catch (createError: unknown) {
        console.error(`Failed to create collection: ${createError instanceof Error ? createError.message : String(createError)}`);
        return false;
      }
    } else {
      console.error(`Error checking collection: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

/**
 * Analyzes code for common issues and best practices.
 */
export function analyzeCode(code: string, language: string): CodeAnalysisResult {
  const issues = [];
  const bestPractices = [];
  
  // Common issues across languages
  if (code.includes("TODO")) {
    issues.push({
      severity: "Info",
      message: "Code contains TODO comments that should be addressed",
      suggestion: "Resolve or remove TODO comments before finalizing the code"
    });
  }
  
  if (code.includes("console.log") && (language === "javascript" || language === "typescript")) {
    issues.push({
      severity: "Warning",
      message: "Debug console.log statements found in code",
      suggestion: "Remove console.log statements before production deployment"
    });
  }
  
  if (code.includes("print(") && language === "python") {
    issues.push({
      severity: "Info",
      message: "Debug print statements found in code",
      suggestion: "Consider using a proper logging framework instead of print statements"
    });
  }
  
  // Check for long lines
  const lines = code.split("\n");
  lines.forEach((line, index) => {
    if (line.length > 100) {
      issues.push({
        severity: "Style",
        message: "Line exceeds recommended length of 100 characters",
        suggestion: "Break long lines into multiple lines for better readability",
        line: index + 1
      });
    }
  });
  
  // Language-specific best practices
  if (language === "javascript" || language === "typescript") {
    bestPractices.push("Use const for variables that don't need to be reassigned");
    bestPractices.push("Consider using optional chaining (?.) and nullish coalescing (??) operators");
    bestPractices.push("Use async/await instead of raw promises for better readability");
  } else if (language === "python") {
    bestPractices.push("Follow PEP 8 style guide for consistent code formatting");
    bestPractices.push("Use type hints to improve code readability and enable better tooling");
    bestPractices.push("Consider using f-strings for string formatting in Python 3.6+");
  } else if (language === "rust") {
    bestPractices.push("Use the ? operator for error propagation instead of match where appropriate");
    bestPractices.push("Prefer using iterators and functional approaches when processing collections");
    bestPractices.push("Use strong typing and avoid unnecessary use of Option/Result when a value is guaranteed");
  }
  
  return { issues, bestPractices };
}

/**
 * Formats and lints Rust code.
 */
export async function formatRustCode(code: string): Promise<CodeFormattingResult> {
  const tempFilePath = '/tmp/code_review.rs';
  fs.writeFileSync(tempFilePath, code);
  
  let formattedCode = code; // Default to original code
  let lintOutput = "";
  
  try {
    // Check if rustfmt is available
    await exec("which rustfmt");
    
    // Run rustfmt to format the code
    try {
      await exec(`rustfmt ${tempFilePath}`);
      formattedCode = fs.readFileSync(tempFilePath, 'utf8');
    } catch (error: unknown) {
      console.error(`Error formatting code: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with the review even if formatting fails
    }
    
    // Try to run clippy if available
    try {
      await exec("which clippy-driver");
      const { stdout, stderr } = await exec(`clippy-driver --input-format=auto --emit=json ${tempFilePath}`);
      lintOutput = stdout || stderr || "No issues found by clippy.";
    } catch (error: unknown) {
      lintOutput = `Clippy analysis failed or not available: ${error instanceof Error ? error.message : String(error)}`;
    }
  } catch (error: unknown) {
    lintOutput = "Rust tools (rustfmt, clippy) not found. Install Rust toolchain for better code analysis.";
  }
  
  // Clean up the temp file
  try {
    fs.unlinkSync(tempFilePath);
  } catch (error: unknown) {
    console.error(`Error removing temp file: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return { formattedCode, lintOutput };
}

/**
 * Formats and lints JavaScript/TypeScript code.
 */
export async function formatJsCode(code: string, language: string): Promise<CodeFormattingResult> {
  const extension = language === "typescript" ? "ts" : "js";
  const tempFilePath = `/tmp/code_review.${extension}`;
  fs.writeFileSync(tempFilePath, code);
  
  let formattedCode = code; // Default to original code
  let lintOutput = "";
  
  try {
    // Check if prettier is available
    await exec("which npx");
    
    // Try to run prettier to format the code
    try {
      await exec(`npx prettier --write ${tempFilePath}`);
      formattedCode = fs.readFileSync(tempFilePath, 'utf8');
      lintOutput = "Code formatted with prettier.";
    } catch (error: unknown) {
      lintOutput = `Prettier formatting failed or not available: ${error instanceof Error ? error.message : String(error)}`;
    }
  } catch (error: unknown) {
    lintOutput = "Node.js tools not found. Install Node.js and prettier for better code formatting.";
  }
  
  // Clean up the temp file
  try {
    fs.unlinkSync(tempFilePath);
  } catch (error: unknown) {
    console.error(`Error removing temp file: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return { formattedCode, lintOutput };
}

/**
 * Formats and lints Python code.
 */
export async function formatPythonCode(code: string): Promise<CodeFormattingResult> {
  const tempFilePath = '/tmp/code_review.py';
  fs.writeFileSync(tempFilePath, code);
  
  let formattedCode = code; // Default to original code
  let lintOutput = "";
  
  try {
    // Check if black is available
    await exec("which black");
    
    // Try to run black to format the code
    try {
      await exec(`black ${tempFilePath}`);
      formattedCode = fs.readFileSync(tempFilePath, 'utf8');
      lintOutput = "Code formatted with black.";
    } catch (error: unknown) {
      lintOutput = `Black formatting failed or not available: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    // Try to run pylint if available
    try {
      await exec("which pylint");
      const { stdout, stderr } = await exec(`pylint ${tempFilePath}`);
      lintOutput += "\n\nPylint output:\n" + (stdout || stderr || "No issues found by pylint.");
    } catch (error: unknown) {
      // Pylint not available or failed, continue
    }
  } catch (error: unknown) {
    lintOutput = "Python tools (black, pylint) not found. Install Python development tools for better code analysis.";
  }
  
  // Clean up the temp file
  try {
    fs.unlinkSync(tempFilePath);
  } catch (error: unknown) {
    console.error(`Error removing temp file: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return { formattedCode, lintOutput };
}

/**
 * Finds similar coding patterns in the database.
 */
export async function findSimilarPatterns(code: string, language: string): Promise<SimilarPattern[]> {
  try {
    await ensureCollectionExists();
    
    // Use text search with Qdrant's built-in embedding
    const response = await axios.post(`${QDRANT_SERVER_URL}/collections/${COLLECTION_NAME}/points/search`, {
      text: code,  // Qdrant will handle the embedding
      filter: {
        must: [
          {
            key: "type",
            match: {
              value: "coding_pattern"
            }
          }
        ],
        should: [
          {
            key: "languages",
            match: {
              value: language
            }
          }
        ]
      },
      with_payload: true,
      limit: 3
    });
    
    return response.data.result.map((item: any) => ({
      name: item.payload.name,
      description: item.payload.description,
      example: item.payload.example
    }));
  } catch (error: unknown) {
    console.error(`Error finding similar patterns: ${error instanceof Error ? error.message : String(error)}`);
    return []; // Return empty array on error
  }
}
