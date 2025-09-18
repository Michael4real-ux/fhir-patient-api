/**
 * LRU Cache implementation with TTL and memory management
 */

export interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
    size: number;
    accessCount: number;
    lastAccessed: number;
}

export interface LRUCacheOptions {
    maxSize: number; // Maximum memory size in bytes
    maxEntries?: number; // Maximum number of entries
    defaultTTL: number; // Default TTL in milliseconds
    cleanupInterval?: number; // Cleanup interval in milliseconds
    onEvict?: (key: string, entry: CacheEntry<any>) => void;
}

export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    currentSize: number;
    currentEntries: number;
    hitRate: number;
    memoryUsage: number;
}

export class LRUCache<T = any> {
    private cache = new Map<string, CacheEntry<T>>();
    private accessOrder: string[] = [];
    private options: Required<LRUCacheOptions>;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        currentSize: 0,
        currentEntries: 0,
        hitRate: 0,
        memoryUsage: 0,
    };
    private cleanupTimer?: NodeJS.Timeout;

    constructor(options: LRUCacheOptions) {
        this.options = {
            maxEntries: options.maxEntries || 1000,
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            onEvict: options.onEvict || (() => { }),
            ...options,
        };

        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Get value from cache
     */
    get(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }

        // Check if entry has expired
        if (this.isExpired(entry)) {
            this.delete(key);
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }

        // Update access information
        entry.accessCount++;
        entry.lastAccessed = Date.now();

        // Move to end of access order (most recently used)
        this.moveToEnd(key);

        this.stats.hits++;
        this.updateHitRate();

        return entry.value;
    }

    /**
     * Set value in cache
     */
    set(key: string, value: T, ttl?: number): void {
        const entryTTL = ttl || this.options.defaultTTL;
        const size = this.calculateSize(value);

        // Remove existing entry if it exists
        if (this.cache.has(key)) {
            this.delete(key);
        }

        // Check if we need to make space
        this.ensureSpace(size);

        const entry: CacheEntry<T> = {
            value,
            timestamp: Date.now(),
            ttl: entryTTL,
            size,
            accessCount: 1,
            lastAccessed: Date.now(),
        };

        this.cache.set(key, entry);
        this.accessOrder.push(key);

        this.stats.currentSize += size;
        this.stats.currentEntries++;
        this.updateMemoryUsage();
    }

    /**
     * Delete entry from cache
     */
    delete(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        this.cache.delete(key);
        this.removeFromAccessOrder(key);

        this.stats.currentSize -= entry.size;
        this.stats.currentEntries--;
        this.updateMemoryUsage();

        return true;
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        if (this.isExpired(entry)) {
            this.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Clear all entries
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
        this.stats.currentSize = 0;
        this.stats.currentEntries = 0;
        this.stats.evictions = 0;
        this.updateMemoryUsage();
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Get all keys (non-expired)
     */
    keys(): string[] {
        const validKeys: string[] = [];
        for (const [key, entry] of this.cache.entries()) {
            if (!this.isExpired(entry)) {
                validKeys.push(key);
            }
        }
        return validKeys;
    }

    /**
     * Get cache size in bytes
     */
    size(): number {
        return this.stats.currentSize;
    }

    /**
     * Get number of entries
     */
    length(): number {
        return this.stats.currentEntries;
    }

    /**
     * Cleanup expired entries
     */
    cleanup(): number {
        let removedCount = 0;
        const now = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry, now)) {
                this.delete(key);
                removedCount++;
            }
        }

        return removedCount;
    }

    /**
     * Destroy cache and cleanup resources
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.clear();
    }

    /**
     * Check if entry is expired
     */
    private isExpired(entry: CacheEntry<T>, now?: number): boolean {
        const currentTime = now || Date.now();
        return currentTime - entry.timestamp > entry.ttl;
    }

    /**
     * Calculate approximate size of value in bytes
     */
    private calculateSize(value: T): number {
        if (value === null || value === undefined) {
            return 8; // Approximate size for null/undefined
        }

        if (typeof value === 'string') {
            return value.length * 2; // UTF-16 encoding
        }

        if (typeof value === 'number') {
            return 8; // 64-bit number
        }

        if (typeof value === 'boolean') {
            return 4; // Boolean
        }

        if (typeof value === 'object') {
            try {
                return JSON.stringify(value).length * 2; // Approximate JSON size
            } catch {
                return 1024; // Default size for objects that can't be serialized
            }
        }

        return 64; // Default size for unknown types
    }

    /**
     * Ensure there's enough space for new entry
     */
    private ensureSpace(requiredSize: number): void {
        // Check memory limit
        while (
            (this.stats.currentSize + requiredSize > this.options.maxSize ||
                this.stats.currentEntries >= this.options.maxEntries) &&
            this.accessOrder.length > 0
        ) {
            this.evictLRU();
        }
    }

    /**
     * Evict least recently used entry
     */
    private evictLRU(): void {
        if (this.accessOrder.length === 0) {
            return;
        }

        const keyToEvict = this.accessOrder[0];
        if (!keyToEvict) {
            return;
        }

        const entry = this.cache.get(keyToEvict);

        if (entry) {
            this.options.onEvict(keyToEvict, entry);
            this.stats.evictions++;
        }

        this.delete(keyToEvict);
    }

    /**
     * Move key to end of access order
     */
    private moveToEnd(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
            this.accessOrder.push(key);
        }
    }

    /**
     * Remove key from access order
     */
    private removeFromAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }

    /**
     * Update hit rate
     */
    private updateHitRate(): void {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    }

    /**
     * Update memory usage percentage
     */
    private updateMemoryUsage(): void {
        this.stats.memoryUsage = this.stats.currentSize / this.options.maxSize;
    }

    /**
     * Start cleanup timer
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.options.cleanupInterval);
    }
}