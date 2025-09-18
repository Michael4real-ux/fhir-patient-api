/**
 * Cache integration tests
 */

import { FHIRClient } from '../client/fhir-client';
import { EnhancedHttpClient } from '../http/enhanced-http-client';

// Mock axios to control HTTP responses
jest.mock('axios', () => {
  const mockResponse = {
    data: {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'test-patient',
            name: [{ family: 'Doe', given: ['John'] }],
          },
        },
      ],
    },
    status: 200,
    statusText: 'OK',
    headers: {
      'cache-control': 'max-age=300',
      etag: '"test-etag"',
    },
  };

  return {
    create: jest.fn(() => ({
      request: jest.fn().mockResolvedValue(mockResponse),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    })),
  };
});

describe('Cache Integration', () => {
  describe('FHIRClient with caching enabled', () => {
    let client: FHIRClient;

    beforeEach(() => {
      client = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        cache: {
          enabled: true,
          maxSize: 1024 * 1024, // 1MB
          defaultTTL: 300000, // 5 minutes
          respectCacheHeaders: true,
          staleWhileRevalidate: true,
          strategy: 'adaptive',
        },
        connectionPool: {
          maxConnections: 10,
          maxConnectionsPerHost: 5,
          connectionTimeout: 5000,
          idleTimeout: 30000,
          enableHttp2: false,
        },
      });
    });

    afterEach(async () => {
      if (client && typeof client.destroy === 'function') {
        await client.destroy();
      }
    });

    test('should use enhanced HTTP client when caching is enabled', () => {
      const stats = client.getStats();
      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('connectionPool');
    });

    test('should provide cache management methods', () => {
      expect(() => client.clearCache()).not.toThrow();
      expect(typeof client.invalidateCache('/patients')).toBe('number');
    });

    test('should handle patient queries with caching', async () => {
      // First request should hit the server
      const patients1 = await client.getPatients({ name: 'John' });
      expect(patients1.resourceType).toBe('Bundle');

      // Second identical request should potentially use cache
      const patients2 = await client.getPatients({ name: 'John' });
      expect(patients2.resourceType).toBe('Bundle');

      // Both should return the same structure
      expect(patients1).toEqual(patients2);
    });

    test('should provide performance statistics', async () => {
      await client.getPatients({ name: 'John' });

      const stats = client.getStats();
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('connectionPool');
      expect(stats).toHaveProperty('resilience');

      if (stats?.cache) {
        expect(stats.cache).toHaveProperty('strategy');
        expect(stats.cache.strategy).toBe('adaptive');
      }
    });
  });

  describe('FHIRClient without caching', () => {
    let client: FHIRClient;

    beforeEach(() => {
      client = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        cache: {
          enabled: false,
          maxSize: 1024 * 1024,
          defaultTTL: 300000,
          respectCacheHeaders: true,
          staleWhileRevalidate: true,
          strategy: 'adaptive',
        },
      });
    });

    afterEach(async () => {
      if (client && typeof client.destroy === 'function') {
        await client.destroy();
      }
    });

    test('should use regular HTTP client when caching is disabled', () => {
      const stats = client.getStats();
      expect(stats).toBeNull(); // Regular HTTP client doesn't provide stats
    });

    test('should handle patient queries without caching', async () => {
      const patients = await client.getPatients({ name: 'John' });
      expect(patients.resourceType).toBe('Bundle');
    });

    test('cache methods should be no-ops when caching is disabled', () => {
      expect(() => client.clearCache()).not.toThrow();
      expect(client.invalidateCache('/patients')).toBe(0);
    });
  });

  describe('Cache performance comparison', () => {
    test('should demonstrate cache benefits', async () => {
      // Client with caching
      const cachedClient = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        cache: {
          enabled: true,
          maxSize: 1024 * 1024,
          defaultTTL: 300000,
          respectCacheHeaders: true,
          staleWhileRevalidate: true,
          strategy: 'adaptive',
        },
      });

      // Client without caching
      const nonCachedClient = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        cache: {
          enabled: false,
          maxSize: 1024 * 1024,
          defaultTTL: 300000,
          respectCacheHeaders: true,
          staleWhileRevalidate: true,
          strategy: 'adaptive',
        },
      });

      // Both should work
      const cachedResult = await cachedClient.getPatients({ name: 'John' });
      const nonCachedResult = await nonCachedClient.getPatients({
        name: 'John',
      });

      expect(cachedResult.resourceType).toBe('Bundle');
      expect(nonCachedResult.resourceType).toBe('Bundle');

      // Cached client should provide stats
      expect(cachedClient.getStats()).not.toBeNull();
      expect(nonCachedClient.getStats()).toBeNull();
    });
  });
});
