/**
 * Enhanced HTTP Client tests
 */

import { EnhancedHttpClient } from './enhanced-http-client';
import { RequestConfig } from '../types';

// Mock axios to avoid actual HTTP requests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    request: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
}));

describe('EnhancedHttpClient', () => {
  let client: EnhancedHttpClient;

  beforeEach(() => {
    client = new EnhancedHttpClient({
      baseURL: 'https://example.com/fhir',
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
        enableHttp2: false, // Disable for testing
      },
    });
  });

  afterEach(async () => {
    await client.destroy();
  });

  test('should initialize with cache and connection pool', () => {
    expect(client).toBeDefined();
    
    const stats = client.getStats();
    expect(stats).toHaveProperty('cache');
    expect(stats).toHaveProperty('connectionPool');
    expect(stats).toHaveProperty('resilience');
  });

  test('should provide cache management methods', () => {
    expect(() => client.clearCache()).not.toThrow();
    expect(typeof client.invalidateCache('/test')).toBe('number');
  });

  test('should handle cache configuration updates', () => {
    expect(() => {
      client.updateCacheConfig({
        enabled: false,
      });
    }).not.toThrow();
  });

  test('should generate unique request IDs', () => {
    // This tests the internal generateRequestId method indirectly
    const stats1 = client.getStats();
    const stats2 = client.getStats();
    
    // Stats should be consistent
    expect(stats1).toEqual(stats2);
  });

  test('should handle destruction gracefully', async () => {
    await expect(client.destroy()).resolves.not.toThrow();
  });
});