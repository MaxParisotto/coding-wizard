import axios, { AxiosError } from 'axios';
import { logger } from '../logger.js';
import { setTimeout, clearTimeout } from 'node:timers';

// Response interfaces
interface HealthResponse {
  title: string;
  version: string;
  [key: string]: unknown;
}

interface TelemetryResponse {
  status: number;
  result: {
    app: {
      name: string;
      version: string;
    };
    collections: {
      name: string;
      points_count: number;
      vectors_count: number;
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
}

interface QdrantResponse<T> {
  status: string;
  result: T;
  time?: number;
}

interface QdrantError {
  status: string;
  error: string;
  time?: number;
}

export interface QdrantTestConfig {
    baseUrl: string;
    apiKey?: string;
    vectorSize: number;
    skipCleanup: boolean;
    testTimeout: number;
}

interface ErrorDetails {
  status?: number;
  statusText?: string;
  data?: unknown;
  config?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
  };
}

interface TestResult {
    passed: boolean;
    description: string;
    error?: string;
    details?: ErrorDetails;
}

interface QdrantCollection {
    name: string;
    [key: string]: unknown;
}

interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

interface SearchRequest {
  vector: number[];
  limit?: number;
  filter?: Record<string, unknown>;
}

interface SearchResponse {
  result: Array<{
    id: string | number;
    score: number;
    vector?: number[];
    payload?: Record<string, unknown>;
  }>;
}

interface CollectionInfo {
  status: string;
  optimizer_status: string;
  vectors_count: number;
  indexed_vectors_count: number;
  points_count: number;
  segments_count: number;
  config: Record<string, unknown>;
}

interface QdrantPointResponse {
  id: string | number;
  vector?: number[];
  payload?: Record<string, unknown>;
}

class QdrantTester {
  private config: QdrantTestConfig;
  private testCollectionName: string;
  private testResults: TestResult[] = [];
  private testTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: QdrantTestConfig) {
    this.config = {
      ...config,
      vectorSize: config.vectorSize || 384,
      skipCleanup: config.skipCleanup || false,
      testTimeout: config.testTimeout || 30000,
    };
    this.testCollectionName = `test_collection_${Date.now()}`;
    this.setupTestTimeout();
  }

  private setupTestTimeout() {
    if (this.config.testTimeout) {
      this.testTimeout = setTimeout(() => {
        logger.error(`Test suite timed out after ${this.config.testTimeout}ms`);
        process.exit(1);
      }, this.config.testTimeout);
    }
  }

  private clearTestTimeout() {
    if (this.testTimeout) {
      clearTimeout(this.testTimeout);
      this.testTimeout = null;
    }
  }

  private get axiosConfig() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
        
    // Only add API key if provided
    if (this.config.apiKey) {
      headers['api-key'] = this.config.apiKey;
    }
        
    return { headers };
  }

  private generateVector(dimension?: number): number[] {
    const size = dimension || this.config.vectorSize || 384;
    const vector = Array.from({ length: size }, () => (Math.random() * 2) - 1);
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  }

  private async runTest(description: string, testFn: () => Promise<void>): Promise<TestResult> {
    try {
      await testFn();
      const result: TestResult = { passed: true, description };
      this.testResults.push(result);
      logger.info(`✅ ${description}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const details: ErrorDetails = {};

      if (error instanceof AxiosError) {
        details.status = error.response?.status;
        details.statusText = error.response?.statusText;
        details.data = error.response?.data;
        if (error.config) {
          details.config = {
            url: error.config.url,
            method: error.config.method,
            headers: error.config.headers as Record<string, string>,
          };
        }
      }

      const result: TestResult = { 
        passed: false, 
        description, 
        error: errorMessage,
        details,
      };
            
      this.testResults.push(result);
      logger.error(`❌ ${description}:`, {
        error: errorMessage,
        details,
      });
      return result;
    }
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000,
  ): Promise<T> {
    let lastError: Error | undefined;
        
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, i);
          logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
        
    throw lastError || new Error('Operation failed after retries');
  }

  async runTests() {
    logger.info('Starting Qdrant API tests...', {
      baseUrl: this.config.baseUrl,
      testCollection: this.testCollectionName,
      vectorSize: this.config.vectorSize,
    });
        
    try {
      // Basic Connectivity Tests
      await this.testHealthCheck();
            
      // Skip authentication test for local server if no API key provided
      if (this.config.apiKey) {
        await this.testAuthentication();
      } else {
        logger.info('Skipping authentication test for local server');
      }

      // System Tests
      await this.testTelemetry();

      // Collection Tests
      await this.testCollectionOperations();
      await this.testCollectionValidation();

      // Point Tests
      await this.testPointOperations();
      await this.testPointValidation();
      await this.testSearchOperations();

      // Advanced Tests
      await this.testConcurrentOperations();
      await this.testErrorHandling();

      // Results Summary
      this.logTestSummary();
            
      const allPassed = this.testResults.every(result => result.passed);
      return allPassed;
    } catch (error) {
      logger.error('Test suite failed:', error);
      return false;
    } finally {
      this.clearTestTimeout();
      if (!this.config.skipCleanup) {
        await this.cleanup();
      }
    }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
            
      // Only add API key if provided
      if (this.config.apiKey) {
        headers['api-key'] = this.config.apiKey;
      }
            
      logger.info(`Making ${method} request to ${url}`);
      const response = await axios({
        method,
        url,
        data,
        headers,
        timeout: this.config.testTimeout,
      });
      logger.info(`Response status: ${response.status}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Request failed: ${error.message}`);
        logger.error(`Status: ${error.response?.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response?.data)}`);
      }
      throw error;
    }
  }

  private async testHealthCheck() {
    await this.runTest('Health Check', async () => {
      const data = await this.makeRequest<HealthResponse>('GET', '/health');
      if (!data.title || !data.version) {
        throw new Error('Invalid health check response format');
      }
      logger.info('Server Info:', data);
    });
  }

  private async testAuthentication() {
    await this.runTest('Authentication Validation', async () => {
      try {
        await this.makeRequest<HealthResponse>('GET', '/health', { headers: { 'api-key': 'invalid_key' } });
        throw new Error('Invalid API key was accepted');
      } catch (error) {
        if (!(error instanceof AxiosError) || error.response?.status !== 401) {
          throw new Error('Authentication validation failed');
        }
      }
    });
  }

  private async testTelemetry() {
    await this.runTest('Telemetry Check', async () => {
      const response = await this.makeRequest<TelemetryResponse>('GET', '/telemetry');
                
      if (response.status !== 200) {
        throw new Error('Failed to retrieve telemetry data');
      }

      const telemetry = response.result;
      logger.info('Raw Telemetry Response:', telemetry);

      // More flexible telemetry validation for different Qdrant versions
      if (!telemetry) {
        throw new Error('No telemetry data received');
      }

      // Log whatever telemetry data we get
      logger.info('Telemetry Stats:', {
        memory: telemetry.memory_usage || telemetry.cpu_usage || 'Not available',
        disk: telemetry.disk_usage || telemetry.storage || 'Not available',
        requests: telemetry.request_counters || telemetry.requests || 'Not available',
        version: telemetry.version || 'Not available',
      });
    });
  }

  private async testCollectionOperations() {
    await this.runTest('Collection Operations', async () => {
      // Create collection
      await this.makeRequest<QdrantResponse<void>>('PUT', `/collections/${this.testCollectionName}`, {
        vectors: {
          size: this.config.vectorSize,
          distance: 'Cosine',
        },
      });

      // Get collection info
      const info = await this.makeRequest<QdrantResponse<CollectionInfo>>('GET', `/collections/${this.testCollectionName}`);
      if (!info.result || typeof info.result.vectors_count !== 'number') {
        throw new Error('Invalid collection info response');
      }

      // List collections
      const collections = await this.makeRequest<QdrantResponse<QdrantCollection[]>>('GET', '/collections');
      if (!Array.isArray(collections.result)) {
        throw new Error('Invalid collections list response');
      }
    });
  }

  private async testCollectionValidation() {
    await this.runTest('Collection Configuration Validation', async () => {
      try {
        await this.makeRequest<QdrantResponse<void>>('PUT', '/collections/invalid_collection', {
          vectors: {
            size: -1, // Invalid size
            distance: 'InvalidDistance',
          },
        });
        throw new Error('Invalid collection configuration was accepted');
      } catch (error) {
        if (!(error instanceof AxiosError) || error.response?.status !== 400) {
          throw new Error('Collection validation failed');
        }
      }
    });
  }

  private async testPointOperations() {
    await this.runTest('Point Operations', async () => {
      const testPoint: QdrantPoint = {
        id: Date.now(),
        vector: this.generateVector(),
        payload: {
          test: true,
          timestamp: new Date().toISOString(),
        },
      };

      // Upsert point
      await this.makeRequest<QdrantResponse<void>>('PUT', `/collections/${this.testCollectionName}/points`, {
        points: [testPoint],
      });

      // Search points
      const searchRequest: SearchRequest = {
        vector: testPoint.vector,
        limit: 10,
      };

      const searchResponse = await this.makeRequest<QdrantResponse<SearchResponse>>('POST', `/collections/${this.testCollectionName}/points/search`, searchRequest);
      if (!Array.isArray(searchResponse.result.result)) {
        throw new Error('Invalid search response');
      }
    });
  }

  private async testPointValidation() {
    await this.runTest('Point Validation', async () => {
      const invalidPoint: Partial<QdrantPoint> = {
        id: Date.now(),
        vector: [], // Empty vector
      };

      try {
        await this.makeRequest<QdrantResponse<void>>('PUT', `/collections/${this.testCollectionName}/points`, {
          points: [invalidPoint],
        });
        throw new Error('Invalid point was accepted');
      } catch (error) {
        if (!(error instanceof AxiosError) || error.response?.status !== 400) {
          throw new Error('Point validation failed');
        }
      }
    });
  }

  private async testSearchOperations() {
    await this.runTest('Search Operations', async () => {
      const searchVector = this.generateVector();
      const searchRequest: SearchRequest = {
        vector: searchVector,
        limit: 10,
      };

      const response = await this.makeRequest<QdrantResponse<SearchResponse>>('POST', `/collections/${this.testCollectionName}/points/search`, searchRequest);
      if (!Array.isArray(response.result.result)) {
        throw new Error('Invalid search response format');
      }
    });
  }

  private async testConcurrentOperations() {
    await this.runTest('Concurrent Operations', async () => {
      const points: QdrantPoint[] = Array.from({ length: 5 }, (_, i) => ({
        id: Date.now() + i,
        vector: this.generateVector(),
        payload: { test: true, index: i },
      }));

      await Promise.all([
        this.makeRequest<QdrantResponse<void>>('PUT', `/collections/${this.testCollectionName}/points`, {
          points: points.slice(0, 2),
        }),
        this.makeRequest<QdrantResponse<void>>('PUT', `/collections/${this.testCollectionName}/points`, {
          points: points.slice(2),
        }),
      ]);
    });
  }

  private async testErrorHandling() {
    await this.runTest('Error Response Format', async () => {
      try {
        // Attempt to create a collection with invalid parameters
        await this.makeRequest<QdrantResponse<void>>('PUT', '/collections/invalid_collection_name', {
          vectors: {
            size: -1, // Invalid size to trigger error
          },
        });
        throw new Error('Expected request to fail');
      } catch (error) {
        if (!(error instanceof AxiosError)) {
          throw error;
        }
        
        const response = error.response?.data as QdrantError;
        if (!response || !response.status || !response.error) {
          throw new Error('Invalid error response format');
        }
      }
    });
  }

  private logTestSummary() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    logger.info('\n📊 Test Summary:', {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      success_rate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
    });

    if (failedTests > 0) {
      logger.error('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(result => {
          logger.error(`- ${result.description}`);
          if (result.error) {
            logger.error(`  Error: ${result.error}`);
          }
          if (result.details) {
            logger.error('  Details:', result.details);
          }
        });
    }

    logger.info('\nTest Configuration:', {
      baseUrl: this.config.baseUrl,
      vectorSize: this.config.vectorSize,
      hasApiKey: !!this.config.apiKey,
      skipCleanup: this.config.skipCleanup,
      testTimeout: this.config.testTimeout,
    });
  }

  private async cleanup() {
    try {
      await this.makeRequest<QdrantResponse<void>>('DELETE', `/collections/${this.testCollectionName}`);
      logger.info('Test collection cleaned up successfully');
    } catch (error) {
      logger.warn('Failed to clean up test collection:', error);
    }
  }

  private async testPointRetrieval() {
    await this.runTest('Point Retrieval', async () => {
      const testPoint: QdrantPoint = {
        id: Date.now(),
        vector: this.generateVector(),
        payload: { test: true },
      };

      // Insert test point
      await this.makeRequest<QdrantResponse<void>>('PUT', `/collections/${this.testCollectionName}/points`, {
        points: [testPoint],
      });

      // Retrieve the point
      const response = await this.makeRequest<QdrantResponse<QdrantPointResponse[]>>('GET', `/collections/${this.testCollectionName}/points/${testPoint.id}`);
      
      if (!Array.isArray(response.result)) {
        throw new Error('Invalid point retrieval response');
      }
    });
  }

  private async testCollectionCreation() {
    await this.runTest('Collection Creation', async () => {
      await this.makeRequest<QdrantResponse<void>>('PUT', `/collections/test_collection_${Date.now()}`, {
        vectors: {
          size: this.config.vectorSize,
          distance: 'Cosine',
        },
      });
    });
  }
}

export async function testQdrantAPI(config: QdrantTestConfig): Promise<boolean> {
  const tester = new QdrantTester(config);
  return await tester.runTests();
}