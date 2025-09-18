/**
 * HTTP Cache implementation with cache header compliance
 */

import { LRUCache } from './lru-cache';
import { HttpResponse } from '../types';

export interface HttpCacheEntry {
  response: HttpResponse;
  etag?: string;
  lastModified?: string;
  expires?: number;
  maxAge?: number;
  staleWhileRevalidate?: number;
  mustRevalidate: boolean;
  noCache: boolean;
  noStore: boolean;
  private: boolean;
  public: boolean;
  cachedAt: number;
}

export interface HttpCacheOptions {
  maxSize: number;
  maxEntries?: number;
  defaultTTL: number;
  respectCacheHeaders: boolean;
  staleWhileRevalidate: boolean;
  maxStaleTime?: number;
}

export interface CacheValidationResult {
  isValid: boolean;
  isStale: boolean;
  needsRevalidation: boolean;
  etag?: string;
  lastModified?: string;
}

export class HttpCache {
  private cache: LRUCache<HttpCacheEntry>;
  private options: HttpCacheOptions;

  constructor(options: HttpCacheOptions) {
    this.options = {
      maxStaleTime: 300000, // 5 minutes
      ...options,
    };

    this.cache = new LRUCache<HttpCacheEntry>({
      maxSize: options.maxSize,
      maxEntries: options.maxEntries,
      defaultTTL: options.defaultTTL,
      cleanupInterval: 60000, // 1 minute
    });
  }

  /**
   * Get cached response if valid
   */
  get(key: string): HttpResponse | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const validation = this.validateCacheEntry(entry);

    if (!validation.isValid) {
      this.cache.delete(key);
      return null;
    }

    // Return stale response if allowed
    if (validation.isStale && this.options.staleWhileRevalidate) {
      // Mark for background revalidation
      this.markForRevalidation(key);
      return entry.response;
    }

    if (validation.isStale) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * Store response in cache
   */
  set(
    key: string,
    response: HttpResponse,
    requestHeaders?: Record<string, string>
  ): void {
    const cacheEntry = this.createCacheEntry(response, requestHeaders);

    // Don't cache if no-store directive is present
    if (cacheEntry.noStore) {
      return;
    }

    // Calculate TTL based on cache headers
    const ttl = this.calculateTTL(cacheEntry);

    this.cache.set(key, cacheEntry, ttl);
  }

  /**
   * Check if response can be served from cache
   */
  canServeFromCache(
    key: string,
    requestHeaders?: Record<string, string>
  ): CacheValidationResult {
    const entry = this.cache.get(key);
    if (!entry) {
      return {
        isValid: false,
        isStale: false,
        needsRevalidation: false,
      };
    }

    return this.validateCacheEntry(entry, requestHeaders);
  }

  /**
   * Get validation headers for conditional requests
   */
  getValidationHeaders(key: string): Record<string, string> {
    const entry = this.cache.get(key);
    if (!entry) {
      return {};
    }

    const headers: Record<string, string> = {};

    if (entry.etag) {
      headers['If-None-Match'] = entry.etag;
    }

    if (entry.lastModified) {
      headers['If-Modified-Since'] = entry.lastModified;
    }

    return headers;
  }

  /**
   * Update cache entry with 304 Not Modified response
   */
  updateFromNotModified(key: string, response: HttpResponse): void {
    const entry = this.cache.get(key);
    if (!entry) {
      return;
    }

    // Update cache headers from 304 response
    const updatedEntry = this.updateCacheHeaders(entry, response);
    const ttl = this.calculateTTL(updatedEntry);

    this.cache.set(key, updatedEntry, ttl);
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: string | RegExp): number {
    let invalidatedCount = 0;
    const keys = this.cache.keys();

    for (const key of keys) {
      let shouldInvalidate = false;

      if (typeof pattern === 'string') {
        shouldInvalidate = key.includes(pattern);
      } else {
        shouldInvalidate = pattern.test(key);
      }

      if (shouldInvalidate) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    return invalidatedCount;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Destroy cache
   */
  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Create cache entry from HTTP response
   */
  private createCacheEntry(
    response: HttpResponse,
    _requestHeaders?: Record<string, string>
  ): HttpCacheEntry {
    const headers = response.headers;
    const cacheControl = this.parseCacheControl(headers['cache-control'] || '');

    const entry: HttpCacheEntry = {
      response,
      etag: headers['etag'],
      lastModified: headers['last-modified'],
      expires: headers['expires']
        ? new Date(headers['expires']).getTime()
        : undefined,
      maxAge: cacheControl.maxAge,
      staleWhileRevalidate: cacheControl.staleWhileRevalidate,
      mustRevalidate: cacheControl.mustRevalidate || false,
      noCache: cacheControl.noCache || false,
      noStore: cacheControl.noStore || false,
      private: cacheControl.private || false,
      public: cacheControl.public || false,
      cachedAt: Date.now(),
    };

    return entry;
  }

  /**
   * Parse Cache-Control header
   */
  private parseCacheControl(cacheControl: string): {
    maxAge?: number;
    staleWhileRevalidate?: number;
    mustRevalidate: boolean;
    noCache: boolean;
    noStore: boolean;
    private: boolean;
    public: boolean;
  } {
    const directives = cacheControl
      .toLowerCase()
      .split(',')
      .map(d => d.trim());
    const result = {
      mustRevalidate: false,
      noCache: false,
      noStore: false,
      private: false,
      public: false,
    };

    for (const directive of directives) {
      if (directive === 'must-revalidate') {
        result.mustRevalidate = true;
      } else if (directive === 'no-cache') {
        result.noCache = true;
      } else if (directive === 'no-store') {
        result.noStore = true;
      } else if (directive === 'private') {
        result.private = true;
      } else if (directive === 'public') {
        result.public = true;
      } else if (directive.startsWith('max-age=')) {
        const maxAgeStr = directive.split('=')[1];
        if (maxAgeStr) {
          const maxAge = parseInt(maxAgeStr, 10);
          if (!isNaN(maxAge)) {
            (result as typeof result & { maxAge: number }).maxAge =
              maxAge * 1000; // Convert to milliseconds
          }
        }
      } else if (directive.startsWith('stale-while-revalidate=')) {
        const swrStr = directive.split('=')[1];
        if (swrStr) {
          const swr = parseInt(swrStr, 10);
          if (!isNaN(swr)) {
            (
              result as typeof result & { staleWhileRevalidate: number }
            ).staleWhileRevalidate = swr * 1000; // Convert to milliseconds
          }
        }
      }
    }

    return result;
  }

  /**
   * Calculate TTL for cache entry
   */
  private calculateTTL(entry: HttpCacheEntry): number {
    if (!this.options.respectCacheHeaders) {
      return this.options.defaultTTL;
    }

    // Check for no-cache directive
    if (entry.noCache || entry.noStore) {
      return 0;
    }

    const now = Date.now();

    // Use max-age if available
    if (entry.maxAge !== undefined) {
      return entry.maxAge;
    }

    // Use expires header
    if (entry.expires !== undefined) {
      const ttl = entry.expires - now;
      return Math.max(0, ttl);
    }

    // Fallback to default TTL
    return this.options.defaultTTL;
  }

  /**
   * Validate cache entry
   */
  private validateCacheEntry(
    entry: HttpCacheEntry,
    _requestHeaders?: Record<string, string>
  ): CacheValidationResult {
    const now = Date.now();
    const age = now - entry.cachedAt;

    // Check if entry is fresh
    let maxAge = entry.maxAge || this.options.defaultTTL;

    // Handle expires header
    if (entry.expires !== undefined && entry.maxAge === undefined) {
      maxAge = entry.expires - entry.cachedAt;
    }

    const isFresh = age < maxAge;
    const isStale = !isFresh;

    // Check if must revalidate
    const needsRevalidation = entry.mustRevalidate && isStale;

    // Check request cache-control headers
    if (_requestHeaders) {
      const requestCacheControl = this.parseCacheControl(
        _requestHeaders['cache-control'] || ''
      );

      if (requestCacheControl.noCache) {
        return {
          isValid: false,
          isStale: true,
          needsRevalidation: true,
          etag: entry.etag,
          lastModified: entry.lastModified,
        };
      }
    }

    // Entry is valid if fresh or if stale-while-revalidate is allowed
    const isValid =
      isFresh ||
      (isStale && this.options.staleWhileRevalidate && !needsRevalidation);

    return {
      isValid,
      isStale,
      needsRevalidation,
      etag: entry.etag,
      lastModified: entry.lastModified,
    };
  }

  /**
   * Update cache headers from 304 response
   */
  private updateCacheHeaders(
    entry: HttpCacheEntry,
    response: HttpResponse
  ): HttpCacheEntry {
    const headers = response.headers;
    const cacheControl = this.parseCacheControl(headers['cache-control'] || '');

    return {
      ...entry,
      etag: headers['etag'] || entry.etag,
      lastModified: headers['last-modified'] || entry.lastModified,
      expires: headers['expires']
        ? new Date(headers['expires']).getTime()
        : entry.expires,
      maxAge:
        cacheControl.maxAge !== undefined ? cacheControl.maxAge : entry.maxAge,
      staleWhileRevalidate:
        cacheControl.staleWhileRevalidate !== undefined
          ? cacheControl.staleWhileRevalidate
          : entry.staleWhileRevalidate,
      mustRevalidate: cacheControl.mustRevalidate,
      noCache: cacheControl.noCache,
      noStore: cacheControl.noStore,
      private: cacheControl.private,
      public: cacheControl.public,
      cachedAt: Date.now(), // Update cached time
    };
  }

  /**
   * Mark entry for background revalidation
   */
  private markForRevalidation(key: string): void {
    // This could trigger background revalidation
    // For now, we'll just log it
    console.debug(`Cache entry ${key} marked for revalidation`);
  }
}
