/**
 * Type definitions for the coding-wizard MCP server
 */

/**
 * Type alias for a note object.
 */
export type Note = { 
  title: string; 
  content: string 
};

/**
 * Type alias for a code snippet object.
 */
export type CodeSnippet = {
  id: string;
  code: string;
  language: string;
  description: string;
  tags: string[];
  source: string;
  created_at: string;
};

/**
 * Type alias for a coding pattern object.
 */
export type CodingPattern = {
  id: string;
  name: string;
  description: string;
  languages: string[];
  example: string;
  use_cases: string[];
  created_at: string;
};

/**
 * Type alias for a code solution object.
 */
export type CodeSolution = {
  id: string;
  problem: string;
  solution: string;
  language: string;
  explanation: string;
  tags: string[];
  created_at: string;
};

/**
 * Type for code analysis issues
 */
export type CodeIssue = {
  severity: string;
  message: string;
  suggestion?: string;
  line?: number;
};

/**
 * Type for code analysis result
 */
export type CodeAnalysisResult = {
  issues: CodeIssue[];
  bestPractices: string[];
};

/**
 * Type for code formatting result
 */
export type CodeFormattingResult = {
  formattedCode: string;
  lintOutput: string;
};

export enum LogLevel {
  LOG = 'log',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}
/**
 * Type for similar pattern result
 */
export type SimilarPattern = {
  name: string;
  description: string;
  example: string;
};

/**
 * Type for code generation parameters
 */
export type CodeGenerationParams = {
  description: string;
  language: string;
  includeComments: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
};

/**
 * Type for code completion parameters
 */
export type CodeCompletionParams = {
  code: string;
  language: string;
  position?: number;
  maxTokens: number;
};
