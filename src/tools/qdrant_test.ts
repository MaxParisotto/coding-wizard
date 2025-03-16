import axios from 'axios';
import { logger } from '../utils/logger.js';

interface QdrantTestConfig {
    baseUrl: string;
    apiKey: string;
}

class QdrantTester {
    private config: QdrantTestConfig;
    private testCollectionName: string;

    constructor(config: QdrantTestConfig) {
        this.config = config;
        this.testCollectionName = `test_collection_${Date.now()}`;
    }

    private get axiosConfig() {
        return {
            headers: {
                'api-key': this.config.apiKey,
                'Content-Type': 'application/json'
            }
        };
    }

    private generateVector(dimension: number = 1536): number[] {
        const vector = Array.from({ length: dimension }, () => (Math.random() * 2) - 1);
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return vector.map(val => val / magnitude);
    }

    async runTests() {
        logger.info('Starting Qdrant API tests...');
        
        try {
            // 1. Health Check
            await this.testHealthCheck();

            // 2. Collections Operations
            await this.testCollectionOperations();

            // 3. Points Operations
            await this.testPointOperations();

            logger.info('All tests completed successfully! 🎉');
            return true;
        } catch (error) {
            logger.error('Test suite failed:', error);
            return false;
        } finally {
            // Cleanup
            await this.cleanup();
        }
    }

    private async testHealthCheck() {
        logger.info('Testing Health Check endpoint...');
        const response = await axios.get(this.config.baseUrl, this.axiosConfig);
        if (response.status !== 200) {
            throw new Error('Health check failed');
        }
        logger.info('✅ Health check passed');
    }

    private async testCollectionOperations() {
        logger.info('Testing Collection Operations...');

        // List collections (initial)
        const listResponse = await axios.get(`${this.config.baseUrl}/collections`, this.axiosConfig);
        logger.info('Current collections:', listResponse.data.result.collections);

        // Create collection
        const createResponse = await axios.put(
            `${this.config.baseUrl}/collections/${this.testCollectionName}`,
            {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                }
            },
            this.axiosConfig
        );
        if (createResponse.status !== 200) {
            throw new Error('Collection creation failed');
        }
        logger.info(`✅ Collection "${this.testCollectionName}" created`);

        // Get collection info
        const infoResponse = await axios.get(
            `${this.config.baseUrl}/collections/${this.testCollectionName}`,
            this.axiosConfig
        );
        logger.info('Collection info:', infoResponse.data);
    }

    private async testPointOperations() {
        logger.info('Testing Point Operations...');

        const testPoints = [
            {
                id: 1,
                vector: this.generateVector(),
                payload: { text: "First test point" }
            },
            {
                id: 2,
                vector: this.generateVector(),
                payload: { text: "Second test point" }
            }
        ];

        // Insert points
        const insertResponse = await axios.put(
            `${this.config.baseUrl}/collections/${this.testCollectionName}/points`,
            { points: testPoints },
            this.axiosConfig
        );
        logger.info('✅ Points inserted');

        // Search points
        const searchResponse = await axios.post(
            `${this.config.baseUrl}/collections/${this.testCollectionName}/points/search`,
            {
                vector: this.generateVector(),
                limit: 3,
                with_payload: true
            },
            this.axiosConfig
        );
        logger.info('Search results:', searchResponse.data.result);

        // Get points
        const getResponse = await axios.post(
            `${this.config.baseUrl}/collections/${this.testCollectionName}/points`,
            {
                ids: [1, 2],
                with_payload: true
            },
            this.axiosConfig
        );
        logger.info('Retrieved points:', getResponse.data.result);
    }

    private async cleanup() {
        try {
            logger.info('Cleaning up test data...');
            
            // Delete test collection
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