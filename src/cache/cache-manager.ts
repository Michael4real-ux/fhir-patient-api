/**
 * Cache Manager - Integrates LRU cache with HTTP cache compliance
 */

import { LRUCache } from './lru-cache';
import { HttpCache, HttpCacheOptions } from './http-cache';
import { HttpResponse } from '../types';

export interface CacheConfig {
  enabled: boolean;
  maxSize: number; // Maximum memory size in bytes
  maxEntries?: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in milliseconds
  respectCacheHeaders: boolean;
  staleWhileRevalidate: boolean;
  maxStaleTime?: number;
  strategy: 'lru' | 'http' | 'adaptive';
}

export interface CacheManagerStats {
  lru?: object;
  http?: object;
  strategy: string;
  enabled: boolean;
}

export class CacheManager {
  private config: CacheConfig;
  private lruCache?: LRUCache;
  private httpCache?: HttpCache;

  constructor(config: CacheConfig) {
    this.config = config;

    if (config.enabled) {
      this.initializeCaches();
    }
  }

  /**
   * Get cached response
   */
  async get(
    key: string,
    _requestHeaders?: Record<string, string>
  ): Promise<HttpResponse | null> {
    if (!this.config.enabled) {
      return null;
    }

    switch (this.config.strategy) {
      case 'lru':
        return this.lruCache?.get(key) || null;

      case 'http':
        return this.httpCache?.get(key) || null;

      case 'adaptive':
        // Try HTTP cache first, fallback to LRU
        const httpResult = this.httpCache?.get(key);
        if (httpResult) {
          return httpResult;
        }
        return this.lruCache?.get(key) || null;

      default:
        return null;
    }
  }

  /**
   * Store response in cache
   */
  async set(
    key: string,
    response: HttpResponse,
    requestHeaders?: Record<string, string>,
    ttl?: number
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    switch (this.config.strategy) {
      case 'lru':
        this.lruCache?.set(key, response, ttl);
        break;

      case 'http':
        this.httpCache?.set(key, response, requestHeaders);
        break;

      case 'adaptive':
        // Store in both caches
        this.httpCache?.set(key, response, requestHeaders);
        this.lruCache?.set(key, response, ttl);
        break;
    }
  }

  /**
   * Check if response can be served from cache
   */
  canServeFromCache(
    key: string,
    requestHeaders?: Record<string, string>
  ): boolean {
    if (!this.config.enabled) {
      return false;
    }

    switch (this.config.strategy) {
      case 'lru':
        return this.lruCache?.has(key) || false;

      case 'http':
        const validation = this.httpCache?.canServeFromCache(
          key,
          requestHeaders
        );
        return validation?.isValid || false;

      case 'adaptive':
        // Check both caches
        const httpValidation = this.httpCache?.canServeFromCache(
          key,
          requestHeaders
        );
        if (httpValidation?.isValid) {
          return true;
        }
        return this.lruCache?.has(key) || false;

      default:
        return false;
    }
  }

  /**
   * Get validation headers for conditional requests
   */
  getValidationHeaders(key: string): Record<string, string> {
    if (!this.config.enabled || this.config.strategy === 'lru') {
      return {};
    }

    return this.httpCache?.getValidationHeaders(key) || {};
  }

  /**
   * Update cache with 304 Not Modified response
   */
  updateFromNotModified(key: string, response: HttpResponse): void {
    if (!this.config.enabled || this.config.strategy === 'lru') {
      return;
    }

    this.httpCache?.updateFromNotModified(key, response);
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: string | RegExp): number {
    if (!this.config.enabled) {
      return 0;
    }

    let invalidatedCount = 0;

    switch (this.config.strategy) {
      case 'lru':
        // LRU cache doesn't have pattern invalidation, clear all
        if (typeof pattern === 'string') {
          const keys = this.lruCache?.keys() || [];
          for (const key of keys) {
            if (key.includes(pattern)) {
              this.lruCache?.delete(key);
              invalidatedCount++;
            }
          }
        }
        break;

      case 'http':
        invalidatedCount = this.httpCache?.invalidate(pattern) || 0;
        break;

      case 'adaptive':
        // Invalidate from both caches
        invalidatedCount += this.httpCache?.invalidate(pattern) || 0;
        if (typeof pattern === 'string') {
          const keys = this.lruCache?.keys() || [];
          for (const key of keys) {
            if (key.includes(pattern)) {
              this.lruCache?.delete(key);
              invalidatedCount++;
            }
          }
        }
        break;
    }

    return invalidatedCount;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.lruCache?.clear();
    this.httpCache?.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheManagerStats {
    return {
      lru: this.lruCache?.getStats(),
      http: this.httpCache?.getStats(),
      strategy: this.config.strategy,
      enabled: this.config.enabled,
    };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    const oldEnabled = this.config.enabled;
    this.config = { ...this.config, ...newConfig };

    // Reinitialize caches if enabled state changed
    if (oldEnabled !== this.config.enabled) {
      if (this.config.enabled) {
        this.initializeCaches();
      } else {
        this.destroyCaches();
      }
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    this.destroyCaches();
  }

  /**
   * Generate cache key from URL and parameters
   */
  static generateKey(
    url: string,
    params?: Record<string, any>,
    headers?: Record<string, string>
  ): string {
    let key = url;

    if (params && Object.keys(params).length > 0) {
      const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}=${encodeURIComponent(String(params[k]))}`)
        .join('&');
      key += `?${sortedParams}`;
    }

    // Include relevant headers that affect response
    if (headers) {
      const relevantHeaders = ['accept', 'accept-language', 'authorization'];
      const headerParts = relevantHeaders
        .filter(h => headers[h])
        .map(h => `${h}:${headers[h]}`)
        .join('|');

      if (headerParts) {
        key += `#${headerParts}`;
      }
    }

    return key;
  }

  /**
   * Initialize caches based on configuration
   */
  private initializeCaches(): void {
    if (this.config.strategy === 'lru' || this.config.strategy === 'adaptive') {
      this.lruCache = new LRUCache({
        maxSize: this.config.maxSize,
        maxEntries: this.config.maxEntries,
        defaultTTL: this.config.defaultTTL,
      });
    }

    if (
      this.config.strategy === 'http' ||
      this.config.strategy === 'adaptive'
    ) {
      const httpOptions: HttpCacheOptions = {
        maxSize: this.config.maxSize,
        maxEntries: this.config.maxEntries,
        defaultTTL: this.config.defaultTTL,
        respectCacheHeaders: this.config.respectCacheHeaders,
        staleWhileRevalidate: this.config.staleWhileRevalidate,
        maxStaleTime: this.config.maxStaleTime,
      };

      this.httpCache = new HttpCache(httpOptions);
    }
  }

  /**
   * Destroy all caches
   */
  private destroyCaches(): void {
    this.lruCache?.destroy();
    this.httpCache?.destroy();
    this.lruCache = undefined;
    this.httpCache = undefined;
  }
}
