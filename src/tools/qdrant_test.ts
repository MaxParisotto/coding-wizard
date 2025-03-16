import axios, { AxiosError } from 'axios';
import { logger } from '../logger.js';

interface QdrantTestConfig {
    baseUrl: string;
    apiKey: string;
    vectorSize?: number;
    skipCleanup?: boolean;
    testTimeout?: number;
}

interface TestResult {
    passed: boolean;
    description: string;
    error?: string;
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
        return {
            headers: {
                'api-key': this.config.apiKey,
                'Content-Type': 'application/json'
            }
        };
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
            const result = { passed: false, description, error: errorMessage };
            this.testResults.push(result);
            logger.error(`❌ ${description}:`, errorMessage);
            return result;
        }
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
            await this.testAuthentication();

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

    private async testHealthCheck() {
        await this.runTest('Health Check', async () => {
            const response = await axios.get(this.config.baseUrl, this.axiosConfig);
            if (response.status !== 200) {
                throw new Error(`Health check failed with status ${response.status}`);
            }
        });
    }

    private async testAuthentication() {
        await this.runTest('Authentication Validation', async () => {
            try {
                await axios.get(this.config.baseUrl, {
                    headers: { 'api-key': 'invalid_key' }
                });
                throw new Error('Invalid API key was accepted');
            } catch (error) {
                if (!(error instanceof AxiosError) || error.response?.status !== 401) {
                    throw new Error('Authentication validation failed');
                }
            }
        });
    }

    private async testCollectionOperations() {
        await this.runTest('Collection Creation', async () => {
            const response = await axios.put(
                `${this.config.baseUrl}/collections/${this.testCollectionName}`,
                {
                    vectors: {
                        size: this.config.vectorSize,
                        distance: 'Cosine'
                    }
                },
                this.axiosConfig
            );
            if (response.status !== 200) {
                throw new Error('Collection creation failed');
            }
        });

        await this.runTest('Collection Listing', async () => {
            const response = await axios.get(`${this.config.baseUrl}/collections`, this.axiosConfig);
            const collections = response.data.result.collections as QdrantCollection[];
            if (!collections.some((c: QdrantCollection) => c.name === this.testCollectionName)) {
                throw new Error('Created collection not found in list');
            }
        });
    }

    private async testCollectionValidation() {
        await this.runTest('Collection Configuration Validation', async () => {
            try {
                await axios.put(
                    `${this.config.baseUrl}/collections/invalid_collection`,
                    {
                        vectors: {
                            size: -1, // Invalid size
                            distance: 'InvalidDistance'
                        }
                    },
                    this.axiosConfig
                );
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
            const response = await axios.put(
                `${this.config.baseUrl}/collections/${this.testCollectionName}/points`,
                { points: testPoints },
                this.axiosConfig
            );
            if (response.status !== 200) {
                throw new Error('Point insertion failed');
            }
        });

        await this.runTest('Point Retrieval', async () => {
            const response = await axios.post(
                `${this.config.baseUrl}/collections/${this.testCollectionName}/points`,
                {
                    ids: [1, 2],
                    with_payload: true
                },
                this.axiosConfig
            );
            if (response.data.result.length !== 2) {
                throw new Error('Not all points were retrieved');
            }
        });
    }

    private async testPointValidation() {
        await this.runTest('Point Data Validation', async () => {
            try {
                await axios.put(
                    `${this.config.baseUrl}/collections/${this.testCollectionName}/points`,
                    {
                        points: [{
                            id: 'invalid', // Invalid ID type
                            vector: [1], // Invalid vector size
                            payload: null
                        }]
                    },
                    this.axiosConfig
                );
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
            const response = await axios.post(
                `${this.config.baseUrl}/collections/${this.testCollectionName}/points/search`,
                {
                    vector: this.generateVector(),
                    limit: 3,
                    with_payload: true
                },
                this.axiosConfig
            );
            if (!Array.isArray(response.data.result)) {
                throw new Error('Search results are not in expected format');
            }
        });

        await this.runTest('Filtered Search', async () => {
            const response = await axios.post(
                `${this.config.baseUrl}/collections/${this.testCollectionName}/points/search`,
                {
                    vector: this.generateVector(),
                    filter: {
                        must: [
                            {
                                key: 'tags',
                                match: { value: 'test' }
                            }
                        ]
                    },
                    limit: 3
                },
                this.axiosConfig
            );
            if (!Array.isArray(response.data.result)) {
                throw new Error('Filtered search failed');
            }
        });
    }

    private async testConcurrentOperations() {
        await this.runTest('Concurrent Operations', async () => {
            const operations = Array(5).fill(null).map(() => 
                axios.post(
                    `${this.config.baseUrl}/collections/${this.testCollectionName}/points/search`,
                    {
                        vector: this.generateVector(),
                        limit: 1
                    },
                    this.axiosConfig
                )
            );
            
            await Promise.all(operations);
        });
    }

    private async testErrorHandling() {
        await this.runTest('Error Response Format', async () => {
            try {
                await axios.get(
                    `${this.config.baseUrl}/collections/nonexistent_collection`,
                    this.axiosConfig
                );
                throw new Error('Request to nonexistent collection should fail');
            } catch (error) {
                if (!(error instanceof AxiosError) || 
                    !error.response?.data?.status?.error) {
                    throw new Error('Error response format is not as expected');
                }
            }
        });
    }

    private logTestSummary() {
        const total = this.testResults.length;
        const passed = this.testResults.filter(r => r.passed).length;
        const failed = total - passed;

        logger.info('\n=== Test Summary ===');
        logger.info(`Total Tests: ${total}`);
        logger.info(`Passed: ${passed}`);
        logger.info(`Failed: ${failed}`);
        logger.info(`Vector Size: ${this.config.vectorSize}`);
        logger.info(`Collection: ${this.testCollectionName}`);

        if (failed > 0) {
            logger.error('\nFailed Tests:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(r => {
                    logger.error(`- ${r.description}: ${r.error}`);
                });
        }
    }

    private async cleanup() {
        if (this.config.skipCleanup) {
            logger.info('Skipping cleanup as requested');
            return;
        }

        try {
            logger.info('Cleaning up test data...');
            await axios.delete(
                `${this.config.baseUrl}/collections/${this.testCollectionName}`,
                this.axiosConfig
            );
            logger.info(`✅ Test collection "${this.testCollectionName}" deleted`);
        } catch (error) {
            logger.warn('Cleanup failed:', error);
        }
    }
}

export async function testQdrantAPI(config: QdrantTestConfig): Promise<boolean> {
    const tester = new QdrantTester(config);
    return await tester.runTests();
}