/**
 * Basic cache functionality tests
 */

import { LRUCache } from './lru-cache';
import { HttpCache } from './http-cache';
import { CacheManager } from './cache-manager';
import { HttpResponse } from '../types';

describe('Cache Functionality', () => {
  describe('LRUCache', () => {
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

    test('should store and retrieve values', () => {
      cache.set('key1', { data: 'value1' });
      const result = cache.get('key1');

      expect(result).toEqual({ data: 'value1' });
    });

    test('should return null for non-existent keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    test('should handle TTL expiration', done => {
      cache.set('key1', { data: 'value1' }, 100); // 100ms TTL

      setTimeout(() => {
        const result = cache.get('key1');
        expect(result).toBeNull();
        done();
      }, 150);
    });

    test('should provide statistics', () => {
      cache.set('key1', { data: 'value1' });
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.currentEntries).toBe(1);
    });

    test('should clear all entries', () => {
      cache.set('key1', { data: 'value1' });
      cache.set('key2', { data: 'value2' });

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.getStats().currentEntries).toBe(0);
    });
  });

  describe('HttpCache', () => {
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

    test('should store and retrieve HTTP responses', () => {
      const response: HttpResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {
          'cache-control': 'max-age=300',
          etag: '"test-etag"',
        },
      };

      cache.set('key1', response);
      const result = cache.get('key1');

      expect(result).toEqual(response);
    });

    test('should respect no-store directive', () => {
      const response: HttpResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {
          'cache-control': 'no-store',
        },
      };

      cache.set('key1', response);
      const result = cache.get('key1');

      expect(result).toBeNull();
    });

    test('should provide validation headers', () => {
      const response: HttpResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {
          'cache-control': 'max-age=300',
          etag: '"test-etag"',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      };

      cache.set('key1', response);
      const validationHeaders = cache.getValidationHeaders('key1');

      expect(validationHeaders['If-None-Match']).toBe('"test-etag"');
      expect(validationHeaders['If-Modified-Since']).toBe(
        'Wed, 21 Oct 2015 07:28:00 GMT'
      );
    });
  });

  describe('CacheManager', () => {
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

    test('should handle adaptive caching', async () => {
      const response: HttpResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {
          'cache-control': 'max-age=300',
        },
      };

      await cacheManager.set('key1', response);
      const result = await cacheManager.get('key1');

      expect(result).toEqual(response);
    });

    test('should generate cache keys consistently', () => {
      const key1 = CacheManager.generateKey('/api/patients', { name: 'John' });
      const key2 = CacheManager.generateKey('/api/patients', { name: 'John' });

      expect(key1).toBe(key2);
    });

    test('should handle cache invalidation', async () => {
      const response: HttpResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {},
      };

      await cacheManager.set('/api/patients/1', response);
      await cacheManager.set('/api/patients/2', response);
      await cacheManager.set('/api/practitioners/1', response);

      const invalidatedCount = cacheManager.invalidate('/api/patients');

      expect(invalidatedCount).toBeGreaterThan(0);

      const result1 = await cacheManager.get('/api/patients/1');
      const result2 = await cacheManager.get('/api/practitioners/1');

      expect(result1).toBeNull();
      expect(result2).toEqual(response); // Should not be invalidated
    });

    test('should provide statistics', () => {
      const stats = cacheManager.getStats();

      expect(stats).toHaveProperty('strategy');
      expect(stats).toHaveProperty('enabled');
      expect(stats.strategy).toBe('adaptive');
      expect(stats.enabled).toBe(true);
    });
  });
});
