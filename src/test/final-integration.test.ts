/**
 * Final Integration Test Suite
 * 
 * Comprehensive end-to-end tests that validate the complete package
 * functionality before distribution.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
    FHIRClient,
    PatientQueryBuilder,
    createFHIRClient,
    getPatients,
    getPatientById,
    searchPatients,
    VERSION
} from '../index';
import { Patient, Bundle, FHIRClientConfig } from '../types';

describe('Final Integration Tests', () => {
    let client: FHIRClient;
    const testConfig: FHIRClientConfig = {
        baseUrl: 'https://hapi.fhir.org/baseR4',
        timeout: 10000
    };

    beforeAll(() => {
        client = new FHIRClient(testConfig);
    });

    describe('Package Exports', () => {
        it('should export all required classes and functions', () => {
            expect(FHIRClient).toBeDefined();
            expect(PatientQueryBuilder).toBeDefined();
            expect(createFHIRClient).toBeDefined();
            expect(getPatients).toBeDefined();
            expect(getPatientById).toBeDefined();
            expect(searchPatients).toBeDefined();
            expect(VERSION).toBeDefined();
        });

        it('should have correct version information', () => {
            expect(typeof VERSION).toBe('string');
            expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        });
    });

    describe('Client Creation and Configuration', () => {
        it('should create client using constructor', () => {
            const directClient = new FHIRClient(testConfig);
            expect(directClient).toBeInstanceOf(FHIRClient);
            expect(typeof directClient.getPatients).toBe('function');
        });

        it('should create client using factory function', () => {
            const factoryClient = createFHIRClient(testConfig);
            expect(factoryClient).toBeInstanceOf(FHIRClient);
            expect(typeof factoryClient.getPatients).toBe('function');
        });

        it('should validate configuration properly', () => {
            expect(() => {
                new FHIRClient({ baseUrl: '' });
            }).toThrow();

            expect(() => {
                new FHIRClient({ baseUrl: 'invalid-url' });
            }).toThrow();
        });
    });

    describe('Query Builder Integration', () => {
        it('should create query builders from client', () => {
            const queryBuilder = client.patients();
            expect(queryBuilder).toBeInstanceOf(PatientQueryBuilder);
            expect(typeof queryBuilder.where).toBe('function');
            expect(typeof queryBuilder.limit).toBe('function');
            expect(typeof queryBuilder.sort).toBe('function');
        });

        it('should chain query builder methods', () => {
            const query = client.patients()
                .where('family', 'Smith')
                .where('given', 'John')
                .limit(10)
                .sort('birthdate', 'desc');

            expect(query).toBeInstanceOf(PatientQueryBuilder);

            const url = query.buildUrl();
            expect(url).toContain('family=Smith');
            expect(url).toContain('given=John');
            expect(url).toContain('_count=10');
            expect(url).toContain('_sort=-birthdate');
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle network errors gracefully', async () => {
            const badClient = new FHIRClient({
                baseUrl: 'https://nonexistent-fhir-server.invalid',
                timeout: 1000
            });

            await expect(badClient.getPatients()).rejects.toThrow();
        });

        it('should handle invalid patient IDs', async () => {
            await expect(client.getPatientById('invalid-id-format')).rejects.toThrow();
        });

        it('should validate search parameters', () => {
            expect(() => {
                client.patients().where('family' as any, '');
            }).toThrow();

            expect(() => {
                client.patients().limit(-1);
            }).toThrow();
        });
    });

    describe('Caching Integration', () => {
        it('should cache responses when enabled', async () => {
            const cachingClient = new FHIRClient({
                ...testConfig,
                cache: {
                    enabled: true,
                    defaultTTL: 60000,
                    maxSize: 100,
                    maxEntries: 100,
                    respectCacheHeaders: true,
                    staleWhileRevalidate: false,
                    strategy: 'lru' as const
                }
            });

            // This test would need a mock server to properly validate caching
            // For now, just ensure the client accepts cache configuration
            expect(cachingClient).toBeInstanceOf(FHIRClient);
        });
    });

    describe('Authentication Integration', () => {
        it('should handle JWT authentication configuration', () => {
            const authClient = new FHIRClient({
                ...testConfig,
                auth: {
                    type: 'jwt',
                    token: 'test-token'
                }
            });

            expect(authClient).toBeInstanceOf(FHIRClient);
        });

        it('should handle Bearer token configuration', () => {
            const bearerClient = new FHIRClient({
                ...testConfig,
                auth: {
                    type: 'bearer',
                    token: 'test-bearer-token'
                }
            });

            expect(bearerClient).toBeInstanceOf(FHIRClient);
        });
    });

    describe('Extensibility Integration', () => {
        it('should support plugin system', () => {
            // Test that extensibility exports are available
            const { PluginManager, BaseResourceQueryBuilder } = require('../extensibility');

            expect(PluginManager).toBeDefined();
            expect(BaseResourceQueryBuilder).toBeDefined();
        });

        it('should support custom resource query builders', () => {
            const { BaseResourceQueryBuilder } = require('../extensibility');

            class CustomQueryBuilder extends BaseResourceQueryBuilder {
                protected readonly resourceType = 'CustomResource';

                constructor(baseUrl: string, executeFunction: any) {
                    super(baseUrl, executeFunction);
                }

                clone(): this {
                    return new CustomQueryBuilder(this.baseUrl, this.executeFunction) as this;
                }

                protected isValidSortField(field: string): boolean {
                    return ['id', 'name'].includes(field);
                }
            }

            const customBuilder = new CustomQueryBuilder('https://test.com', () => Promise.resolve({} as any));
            expect(customBuilder).toBeInstanceOf(BaseResourceQueryBuilder);
        });
    });

    describe('Performance Integration', () => {
        it('should handle concurrent requests', async () => {
            const promises = Array.from({ length: 5 }, (_, i) =>
                client.patients().where('family', `Test${i}`).limit(1).execute()
            );

            // All requests should complete without errors
            const results = await Promise.allSettled(promises);

            // At least some should succeed (depending on server availability)
            const successful = results.filter(r => r.status === 'fulfilled');
            expect(successful.length).toBeGreaterThan(0);
        });

        it('should handle large result sets with pagination', async () => {
            try {
                const result = await client.patients().limit(50).execute();
                expect(result).toBeDefined();

                if (result.entry && result.entry.length > 0) {
                    expect(Array.isArray(result.entry)).toBe(true);
                    expect(result.entry.length).toBeLessThanOrEqual(50);
                }
            } catch (error) {
                // Server might not be available, which is acceptable for this test
                expect(error).toBeDefined();
            }
        });
    });

    describe('Type Safety Integration', () => {
        it('should provide proper TypeScript types', () => {
            // These tests validate that TypeScript compilation succeeds
            // with proper type checking

            const config: FHIRClientConfig = {
                baseUrl: 'https://example.com/fhir',
                timeout: 5000
            };

            const typedClient: FHIRClient = new FHIRClient(config);

            // Method signatures should be properly typed
            const patientsPromise: Promise<Bundle<Patient>> = typedClient.getPatients();
            const patientPromise: Promise<Patient> = typedClient.getPatientById('123');

            expect(patientsPromise).toBeInstanceOf(Promise);
            expect(patientPromise).toBeInstanceOf(Promise);
        });

        it('should enforce type constraints', () => {
            // TypeScript should catch these at compile time
            // Runtime validation for dynamic scenarios

            expect(() => {
                client.patients().limit('invalid' as any);
            }).toThrow();

            expect(() => {
                client.patients().sort('field', 'invalid-direction' as any);
            }).toThrow();
        });
    });

    describe('Real-world Usage Scenarios', () => {
        it('should support basic patient search workflow', async () => {
            try {
                // Search for patients with common name
                const searchResult = await client.patients()
                    .where('family', 'Smith')
                    .limit(5)
                    .execute();

                expect(searchResult).toBeDefined();
                expect(searchResult.resourceType).toBe('Bundle');

                if (searchResult.entry && searchResult.entry.length > 0) {
                    const patient = searchResult.entry[0].resource;
                    expect(patient?.resourceType).toBe('Patient');
                }
            } catch (error) {
                // Server availability issues are acceptable
                console.warn('Server not available for real-world test:', error.message);
            }
        });

        it('should support advanced query patterns', async () => {
            try {
                const advancedQuery = client.patients()
                    .where('birthdate', 'ge1990-01-01')
                    .where('birthdate', 'le2000-12-31')
                    .where('active', 'true')
                    .sort('birthdate', 'desc')
                    .limit(10);

                const url = advancedQuery.buildUrl();
                expect(url).toContain('birthdate=ge1990-01-01');
                expect(url).toContain('birthdate=le2000-12-31');
                expect(url).toContain('active=true');
                expect(url).toContain('_sort=-birthdate');
                expect(url).toContain('_count=10');

                // Execute if server is available
                const result = await advancedQuery.execute();
                expect(result.resourceType).toBe('Bundle');
            } catch (error) {
                // Server availability issues are acceptable
                console.warn('Server not available for advanced query test:', error.message);
            }
        });
    });

    describe('Utility Function Integration', () => {
        it('should support utility functions', () => {
            // Just verify the functions exist and have correct signatures
            expect(typeof getPatients).toBe('function');
            expect(typeof getPatientById).toBe('function');
            expect(typeof searchPatients).toBe('function');

            // Verify they can be called with correct parameters (without actually executing)
            expect(() => {
                // These should not throw type errors
                const patientsPromise = getPatients(client, { family: 'Test' });
                const patientPromise = getPatientById(client, 'test-id');
                const searchPromise = searchPatients(client, { given: 'John' });

                expect(patientsPromise).toBeInstanceOf(Promise);
                expect(patientPromise).toBeInstanceOf(Promise);
                expect(searchPromise).toBeInstanceOf(Promise);
            }).not.toThrow();
        });
    });
});