import axios, { AxiosError } from 'axios';
import { logger } from '../logger.js';

export interface QdrantTestConfig {
    baseUrl: string;
    apiKey?: string;
    vectorSize: number;
    skipCleanup: boolean;
    testTimeout: number;
}

interface TestResult {
    passed: boolean;
    description: string;
    error?: string;
    details?: any;
}

interface QdrantCollection {
    name: string;
    [key: string]: unknown;
}

class QdrantTester {
    private config: QdrantTestConfig;
    private testCollectionName: string;
    private testResults: TestResult[] = [];
    private testTimeout: NodeJS.Timeout | null = null;

    constructor(config: QdrantTestConfig) {
        this.config = {
            ...config,
            vectorSize: config.vectorSize || 384,
            skipCleanup: config.skipCleanup || false,
            testTimeout: config.testTimeout || 30000
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
            'Content-Type': 'application/json'
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
            const result = { passed: true, description };
            this.testResults.push(result);
            logger.info(`✅ ${description}`);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const axiosError = error instanceof AxiosError ? {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    headers: error.config?.headers
                }
            } : undefined;

            const result = { 
                passed: false, 
                description, 
                error: errorMessage,
                details: axiosError
            };
            
            this.testResults.push(result);
            logger.error(`❌ ${description}:`, {
                error: errorMessage,
                details: axiosError
            });
            return result;
        }
    }

    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        initialDelay: number = 1000
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
            vectorSize: this.config.vectorSize
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
        data?: any
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
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
            const data = await this.makeRequest<any>('GET', '/health');
            if (!data.title || !data.version) {
                throw new Error('Invalid health check response format');
            }
            logger.info('Server Info:', data);
        });
    }

    private async testAuthentication() {
        await this.runTest('Authentication Validation', async () => {
            try {
                await this.makeRequest<any>('GET', '/health', { headers: { 'api-key': 'invalid_key' } });
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
            try {
                const response = await this.makeRequest<any>('GET', '/telemetry');
                
                if (response.status !== 200) {
                    throw new Error('Failed to retrieve telemetry data');
                }

                const telemetry = response.data;
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
                    version: telemetry.version || 'Not available'
                });
            } catch (error) {
                if (error instanceof AxiosError && error.response?.status === 404) {
                    logger.warn('Telemetry endpoint not available on this Qdrant version - skipping test');
                    return; // Skip this test for versions that don't support telemetry
                }
                throw error;
            }
        });
    }

    private async testCollectionOperations() {
        await this.runTest('Collection Creation', async () => {
            // First check if collection already exists
            const collections = await this.makeRequest<any>('GET', '/collections');
            
            if (collections.result?.collections?.some((c: QdrantCollection) => c.name === this.testCollectionName)) {
                logger.info(`Collection ${this.testCollectionName} already exists, deleting first...`);
                await this.makeRequest('DELETE', `/collections/${this.testCollectionName}`);
            }

            // Create new collection
            const response = await this.makeRequest<any>('PUT', `/collections/${this.testCollectionName}`, {
                vectors: {
                    size: this.config.vectorSize,
                    distance: 'Cosine'
                }
            });
            
            if (response.status !== 'ok') {
                throw new Error(`Collection creation failed: ${JSON.stringify(response)}`);
            }

            // Verify collection was created
            const verifyCollections = await this.makeRequest<any>('GET', '/collections');
            if (!verifyCollections.result?.collections?.some((c: QdrantCollection) => c.name === this.testCollectionName)) {
                throw new Error('Created collection not found in list');
            }

            logger.info(`Created collection: ${this.testCollectionName}`);
        });
    }

    private async testCollectionValidation() {
        await this.runTest('Collection Configuration Validation', async () => {
            try {
                await this.makeRequest<any>('PUT', '/collections/invalid_collection', {
                    vectors: {
                        size: -1, // Invalid size
                        distance: 'InvalidDistance'
                    }
                });
                throw new Error('Invalid collection configuration was accepted');
            } catch (error) {
                if (!(error instanceof AxiosError) || error.response?.status !== 400) {
                    throw error;
                }
            }
        });
    }

    private async testPointOperations() {
        const testPoints = [
            {
                id: 1,
                vector: this.generateVector(),
                payload: { text: "First test point", tags: ["test"] }
            },
            {
                id: 2,
                vector: this.generateVector(),
                payload: { text: "Second test point", tags: ["test"] }
            }
        ];

        await this.runTest('Point Insertion', async () => {
            const response = await this.makeRequest<any>(
                'PUT',
                `/collections/${this.testCollectionName}/points`,
                { points: testPoints }
            );
            
            if (response.status !== 'ok') {
                throw new Error(`Point insertion failed: ${JSON.stringify(response)}`);
            }

            // Wait a moment for points to be indexed
            await new Promise(resolve => setTimeout(resolve, 1000));
        });

        await this.runTest('Point Retrieval', async () => {
            const response = await this.makeRequest<any>(
                'POST',
                `/collections/${this.testCollectionName}/points`,
                {
                    ids: [1, 2],
                    with_payload: true
                }
            );
            
            if (!response.result || response.result.length !== 2) {
                throw new Error(`Not all points were retrieved: ${JSON.stringify(response)}`);
            }
        });
    }

    private async testPointValidation() {
        await this.runTest('Point Data Validation', async () => {
            try {
                await this.makeRequest<any>('PUT', `/collections/${this.testCollectionName}/points`, {
                    points: [{
                        id: 'invalid', // Invalid ID type
                        vector: [1], // Invalid vector size
                        payload: null
                    }]
                });
                throw new Error('Invalid point data was accepted');
            } catch (error) {
                if (!(error instanceof AxiosError) || error.response?.status !== 400) {
                    throw error;
                }
            }
        });
    }

    private async testSearchOperations() {
        await this.runTest('Vector Search', async () => {
            const searchVector = this.generateVector();
            const response = await this.makeRequest<any>('POST', `/collections/${this.testCollectionName}/points/search`, {
                vector: searchVector,
                limit: 2,
                with_payload: true,
                with_vector: false
            });
            
            if (!Array.isArray(response.data.result) || response.data.result.length === 0) {
                throw new Error('Search returned no results');
            }
        });

        await this.runTest('Filtered Search', async () => {
            const searchVector = this.generateVector();
            const response = await this.makeRequest<any>('POST', `/collections/${this.testCollectionName}/points/search`, {
                vector: searchVector,
                filter: {
                    must: [
                        {
                            key: 'tags',
                            match: {
                                value: 'test'
                            }
                        }
                    ]
                },
                limit: 2,
                with_payload: true
            });
            
            if (!Array.isArray(response.data.result)) {
                throw new Error('Filtered search failed');
            }
        });
    }

    private async testConcurrentOperations() {
        await this.runTest('Concurrent Point Operations', async () => {
            const points = Array.from({ length: 5 }, (_, i) => ({
                id: 1000 + i,
                vector: this.generateVector(),
                payload: { text: `Concurrent test point ${i}`, tags: ['concurrent'] }
            }));

            const operations = points.map(point => 
                this.makeRequest<any>('PUT', `/collections/${this.testCollectionName}/points`, { points: [point] })
            );

            await Promise.all(operations);

            const response = await this.makeRequest<any>('POST', `/collections/${this.testCollectionName}/points`, {
                ids: points.map(p => p.id),
                with_payload: true
            });

            if (response.data.result.length !== points.length) {
                throw new Error('Not all concurrent points were stored successfully');
            }
        });
    }

    private async testErrorHandling() {
        await this.runTest('Error Response Format', async () => {
            try {
                await this.makeRequest<any>('POST', `/collections/${this.testCollectionName}/points/search`, {
                    vector: this.generateVector(this.config.vectorSize! + 1) // Invalid vector size
                });
                throw new Error('Invalid vector size was accepted');
            } catch (error) {
                if (!(error instanceof AxiosError)) {
                    throw error;
                }
                const response = error.response;
                if (!response || response.status !== 400 || !response.data.status?.error) {
                    throw new Error('Error response format is incorrect');
                }
            }
        });
    }

    private logTestSummary() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;

        logger.info('\n=== Test Summary ===');
        logger.info(`Total Tests: ${totalTests}`);
        logger.info(`Passed: ${passedTests} ✅`);
        logger.info(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : ''}`);

        if (failedTests > 0) {
            logger.info('\nFailed Tests:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(result => {
                    logger.error(`❌ ${result.description}`);
                    if (result.error) {
                        logger.error(`   Error: ${result.error}`);
                    }
                    if (result.details) {
                        logger.error('   Details:', result.details);
                    }
                });
        }

        logger.info('\nTest Configuration:', {
            baseUrl: this.config.baseUrl,
            vectorSize: this.config.vectorSize,
            hasApiKey: !!this.config.apiKey,
            skipCleanup: this.config.skipCleanup,
            testTimeout: this.config.testTimeout
        });
    }

    private async cleanup() {
        try {
            // Check if collection exists before trying to delete
            const collections = await this.makeRequest<any>('GET', '/collections');
            
            const existingCollections = collections.data.result.collections as QdrantCollection[];
            if (existingCollections.some(c => c.name === this.testCollectionName)) {
                await this.makeRequest('DELETE', `/collections/${this.testCollectionName}`);
                logger.info(`Cleaned up test collection: ${this.testCollectionName}`);
            } else {
                logger.info(`Collection ${this.testCollectionName} already cleaned up`);
            }
        } catch (error) {
            logger.warn('Failed to cleanup test collection:', error);
        }
    }
}

export async function testQdrantAPI(config: QdrantTestConfig): Promise<boolean> {
    const tester = new QdrantTester(config);
    return await tester.runTests();
}