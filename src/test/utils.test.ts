import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { findSimilarPatterns, getClient, getEmbedding } from '../utils.js';

describe('Vector Search Tests', () => {
  // Store original environment variables
  const originalEnv = {
    QDRANT_URL: process.env.QDRANT_URL,
    EMBEDDING_API_URL: process.env.EMBEDDING_API_URL,
  };

  // Reset environment variables after each test
  afterEach(() => {
    process.env.QDRANT_URL = originalEnv.QDRANT_URL;
    process.env.EMBEDDING_API_URL = originalEnv.EMBEDDING_API_URL;
  });

  beforeAll(async () => {
    // Ensure we have test patterns in the database
    const client = await getClient();
    if (!client) {
      throw new Error('Failed to get Qdrant client for test setup');
    }
    
    // Add TypeScript pattern
    const tsVector = await getEmbedding('function add(a: number, b: number): number { return a + b; }');
    if (!tsVector) {
      throw new Error('Failed to get embedding for TypeScript test pattern');
    }
    
    await client.upsert('mcp', {
      points: [{
        id: 1000,
        vector: tsVector,
        payload: {
          description: 'Addition function',
          source: 'TypeScript utility',
          code: 'function add(a: number, b: number): number { return a + b; }',
          language: 'typescript',
        },
      }],
    });

    // Add Python pattern
    const pyVector = await getEmbedding('def add(a: int, b: int) -> int:\n    return a + b');
    if (!pyVector) {
      throw new Error('Failed to get embedding for Python test pattern');
    }
    
    await client.upsert('mcp', {
      points: [{
        id: 1001,
        vector: pyVector,
        payload: {
          description: 'Addition function',
          source: 'Python utility',
          code: 'def add(a: int, b: int) -> int:\n    return a + b',
          language: 'python',
        },
      }],
    });
  });

  describe('Success Cases', () => {
    it('should find similar TypeScript patterns', async () => {
      const code = 'function multiply(a: number, b: number): number { return a * b; }';
      const results = await findSimilarPatterns(code, 'typescript');
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      
      // The first result should be our TypeScript pattern since it's similar
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('name');
      expect(firstResult).toHaveProperty('description');
      expect(firstResult).toHaveProperty('example');
      expect(firstResult.example).toContain('function');
      expect(firstResult.description).toContain('TypeScript');
    });

    it('should find similar Python patterns', async () => {
      const code = 'def multiply(a: int, b: int) -> int:\n    return a * b';
      const results = await findSimilarPatterns(code, 'python');
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      
      // The first result should be our Python pattern since it's similar
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('name');
      expect(firstResult).toHaveProperty('description');
      expect(firstResult).toHaveProperty('example');
      expect(firstResult.example).toContain('def');
      expect(firstResult.description).toContain('Python');
    });

    it('should handle empty code input', async () => {
      const results = await findSimilarPatterns('', 'typescript');
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle non-existent language filter', async () => {
      const code = 'function test() {}';
      const results = await findSimilarPatterns(code, 'nonexistent');
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should not mix languages in results', async () => {
      // Search for TypeScript patterns
      const tsCode = 'function test(x: number): number { return x * 2; }';
      const tsResults = await findSimilarPatterns(tsCode, 'typescript');
      expect(tsResults.every(r => r.description.toLowerCase().includes('typescript'))).toBe(true);
      
      // Search for Python patterns
      const pyCode = 'def test(x: int) -> int:\n    return x * 2';
      const pyResults = await findSimilarPatterns(pyCode, 'python');
      expect(pyResults.every(r => r.description.toLowerCase().includes('python'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle unavailable embedding service', async () => {
      // Set embedding service URL to an unavailable endpoint
      process.env.EMBEDDING_API_URL = 'http://localhost:9999/embed';
      
      const code = 'function test() {}';
      const results = await findSimilarPatterns(code, 'typescript');
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle unavailable Qdrant service', async () => {
      // Set Qdrant URL to an unavailable endpoint
      process.env.QDRANT_URL = 'http://localhost:9999';
      
      const code = 'function test() {}';
      const results = await findSimilarPatterns(code, 'typescript');
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle invalid embedding service response', async () => {
      // Mock the embedding service to return invalid data
      const mockEmbeddingURL = 'http://localhost:8001/embed';
      process.env.EMBEDDING_API_URL = mockEmbeddingURL;
      
      const code = 'function test() {}';
      const results = await findSimilarPatterns(code, 'typescript');
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });
  });
}); 