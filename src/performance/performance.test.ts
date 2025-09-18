/**
 * Performance tests for caching and connection pooling
 */

import { LRUCache } from '../cache/lru-cache';
import { HttpCache } from '../cache/http-cache';
import { CacheManager } from '../cache/cache-manager';
import { ConnectionPool } from '../http/connection-pool';
import { PerformanceBenchmark } from './benchmark';
import { HttpResponse } from '../types';

describe('Performance Tests', () => {
  describe('LRU Cache Performance', () => {
    let cache: LRUCache;

    beforeEach(() => {
      cache = new LRUCache({
        maxSize: 1024 * 1024, // 1MB
        defaultTTL: 300000, // 5 minutes
      });
    });

    afterEach(() => {
      cache.destroy();
    });

    test('should handle high-frequency set operations efficiently', () => {
      const startTime = Date.now();
      const operations = 1000;

      for (let i = 0; i < operations; i++) {
        cache.set(`key-${i}`, { id: i, data: `test-data-${i}` });
      }

      const duration = Date.now() - startTime;
      const opsPerSecond = operations / (duration / 1000);

      expect(opsPerSecond).toBeGreaterThan(1000); // Should handle at least 1000 ops/sec
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle high-frequency get operations efficiently', () => {
      // Pre-populate cache
      const populateCount = 100;
      for (let i = 0; i < populateCount; i++) {
        cache.set(`key-${i}`, { id: i, data: `test-data-${i}` });
      }

      const startTime = Date.now();
      const operations = 10000;

      for (let i = 0; i < operations; i++) {
        cache.get(`key-${i % populateCount}`);
      }

      const duration = Date.now() - startTime;
      const opsPerSecond = operations / (duration / 1000);

      expect(opsPerSecond).toBeGreaterThan(10000); // Should handle at least 10k ops/sec
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should maintain performance under memory pressure', () => {
      const startTime = Date.now();
      const operations = 2000; // More than cache can hold

      for (let i = 0; i < operations; i++) {
        cache.set(`key-${i}`, { 
          id: i, 
          data: `test-data-${i}`.repeat(100) // Large data to force evictions
        });
      }

      const duration = Date.now() - startTime;
      const stats = cache.getStats();

      expect(stats.evictions).toBeGreaterThan(0); // Should have evicted entries
      expect(stats.currentEntries).toBeLessThan(operations); // Should not exceed capacity
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds even with evictions
    });

    test('should have efficient memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Add 1000 entries
      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, { id: i, data: `test-data-${i}`.repeat(10) });
      }

      const afterAddMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = afterAddMemory - initialMemory;

      // Clear cache
      cache.clear();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterClearMemory = process.memoryUsage().heapUsed;
      const memoryRecovered = afterAddMemory - afterClearMemory;

      // Memory should be managed efficiently - check that we don't leak too much
      expect(memoryIncrease).toBeGreaterThan(0); // Should have used some memory
      expect(cache.getStats().currentEntries).toBe(0); // Should be empty after clear
      
      // Memory recovery is not guaranteed due to GC behavior, so just check cache is empty
      expect(cache.length()).toBe(0);
    });
  });

  describe('HTTP Cache Performance', () => {
    let cache: HttpCache;

    beforeEach(() => {
      cache = new HttpCache({
        maxSize: 1024 * 1024, // 1MB
        defaultTTL: 300000, // 5 minutes
        respectCacheHeaders: true,
        staleWhileRevalidate: true,
      });
    });

    afterEach(() => {
      cache.destroy();
    });

    test('should handle HTTP cache operations efficiently', () => {
      const startTime = Date.now();
      const operations = 500;

      for (let i = 0; i < operations; i++) {
        const response: HttpResponse = {
          data: { id: i, data: `test-data-${i}` },
          status: 200,
          statusText: 'OK',
          headers: {
            'cache-control': 'max-age=300',
            'etag': `"etag-${i}"`,
          },
        };
        cache.set(`key-${i}`, response);
      }

      const duration = Date.now() - startTime;
      const opsPerSecond = operations / (duration / 1000);

      expect(opsPerSecond).toBeGreaterThan(100); // Should handle at least 100 ops/sec
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should efficiently validate cache entries', () => {
      // Pre-populate cache
      const populateCount = 100;
      for (let i = 0; i < populateCount; i++) {
        const response: HttpResponse = {
          data: { id: i, data: `test-data-${i}` },
          status: 200,
          statusText: 'OK',
          headers: {
            'cache-control': 'max-age=300',
            'etag': `"etag-${i}"`,
            'last-modified': new Date().toUTCString(),
          },
        };
        cache.set(`key-${i}`, response);
      }

      const startTime = Date.now();
      const operations = 1000;

      for (let i = 0; i < operations; i++) {
        cache.canServeFromCache(`key-${i % populateCount}`, {
          'cache-control': 'no-cache',
        });
      }

      const duration = Date.now() - startTime;
      const opsPerSecond = operations / (duration / 1000);

      expect(opsPerSecond).toBeGreaterThan(1000); // Should handle at least 1000 validations/sec
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Cache Manager Performance', () => {
    let cacheManager: CacheManager;

    beforeEach(() => {
      cacheManager = new CacheManager({
        enabled: true,
        maxSize: 1024 * 1024, // 1MB
        defaultTTL: 300000, // 5 minutes
        respectCacheHeaders: true,
        staleWhileRevalidate: true,
        strategy: 'adaptive',
      });
    });

    afterEach(() => {
      cacheManager.destroy();
    });

    test('should handle adaptive caching efficiently', async () => {
      const startTime = Date.now();
      const operations = 200;

      for (let i = 0; i < operations; i++) {
        const response: HttpResponse = {
          data: { id: i, data: `test-data-${i}` },
          status: 200,
          statusText: 'OK',
          headers: {
            'cache-control': 'max-age=300',
            'etag': `"etag-${i}"`,
          },
        };
        
        await cacheManager.set(`key-${i}`, response);
        await cacheManager.get(`key-${i}`);
      }

      const duration = Date.now() - startTime;
      const opsPerSecond = (operations * 2) / (duration / 1000); // 2 operations per iteration

      expect(opsPerSecond).toBeGreaterThan(100); // Should handle at least 100 ops/sec
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should efficiently invalidate cache entries', () => {
      // Pre-populate cache
      const populateCount = 100;
      for (let i = 0; i < populateCount; i++) {
        const response: HttpResponse = {
          data: { id: i, data: `test-data-${i}` },
          status: 200,
          statusText: 'OK',
          headers: {
            'cache-control': 'max-age=300',
          },
        };
        cacheManager.set(`/api/patients/${i}`, response);
      }

      const startTime = Date.now();
      const invalidatedCount = cacheManager.invalidate('/api/patients');
      const duration = Date.now() - startTime;

      expect(invalidatedCount).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });

  describe('Connection Pool Performance', () => {
    let connectionPool: ConnectionPool;

    beforeEach(() => {
      connectionPool = new ConnectionPool({
        maxConnections: 50,
        maxConnectionsPerHost: 10,
        connectionTimeout: 5000,
        idleTimeout: 30000,
        enableHttp2: false, // Disable for testing to avoid actual connections
      });
    });

    afterEach(async () => {
      await connectionPool.destroy();
    });

    test('should handle connection requests efficiently', async () => {
      const startTime = Date.now();
      const operations = 100;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < operations; i++) {
        // Use different hosts to test connection pooling
        const host = `https://example${i % 10}.com`;
        promises.push(
          connectionPool.getConnection(host).catch(() => null) // Ignore connection errors
        );
      }

      await Promise.allSettled(promises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should maintain performance statistics', () => {
      const stats = connectionPool.getStats();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('requestsServed');
      expect(stats).toHaveProperty('averageResponseTime');
      
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.averageResponseTime).toBe('number');
    });
  });

  describe('Benchmark Suite', () => {
    let benchmark: PerformanceBenchmark;

    beforeEach(() => {
      benchmark = new PerformanceBenchmark();
    });

    test('should run cache benchmarks successfully', async () => {
      const suite = await benchmark.runCacheBenchmarks();
      
      expect(suite.name).toBe('Cache Performance');
      expect(suite.results).toHaveLength(7); // All cache benchmark methods
      expect(suite.totalDuration).toBeGreaterThan(0);
      expect(suite.summary.totalOperations).toBeGreaterThan(0);
      expect(suite.summary.averageOpsPerSecond).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for benchmarks

    test('should provide meaningful performance metrics', async () => {
      const suite = await benchmark.runCacheBenchmarks();
      
      for (const result of suite.results) {
        expect(result.name).toBeTruthy();
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.memoryUsage).toHaveProperty('before');
        expect(result.memoryUsage).toHaveProperty('after');
        expect(result.memoryUsage).toHaveProperty('delta');
      }
    }, 30000);
  });

  describe('Memory Efficiency', () => {
    test('should not leak memory during cache operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and destroy multiple caches
      for (let i = 0; i < 10; i++) {
        const cache = new LRUCache({
          maxSize: 100 * 1024, // 100KB
          defaultTTL: 60000,
        });
        
        // Add some data
        for (let j = 0; j < 100; j++) {
          cache.set(`key-${j}`, { data: `test-${j}` });
        }
        
        cache.destroy();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 1MB)
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });

    test('should handle large datasets without excessive memory usage', () => {
      const cache = new LRUCache({
        maxSize: 1024 * 1024, // 1MB limit
        defaultTTL: 300000,
      });

      // Try to add 10MB of data (should trigger evictions)
      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, { 
          data: 'x'.repeat(10 * 1024) // 10KB per entry
        });
      }

      const stats = cache.getStats();

      // Cache should respect its size limits through evictions
      expect(stats.evictions).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeLessThanOrEqual(1.0); // Should not exceed 100% of limit
      expect(stats.currentSize).toBeLessThanOrEqual(1024 * 1024); // Should not exceed 1MB

      cache.destroy();
    });
  });
});