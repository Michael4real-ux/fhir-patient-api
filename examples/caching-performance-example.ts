/**
 * FHIR Patient API - Caching and Performance Example
 * 
 * This example demonstrates the caching and performance optimization features
 * of the FHIR Patient API, including LRU cache, HTTP cache compliance,
 * connection pooling, and performance benchmarking.
 */

import { 
  FHIRClient, 
  PerformanceBenchmark,
  LRUCache,
  HttpCache,
  CacheManager,
  ConnectionPool
} from '../src/index';

async function main() {
  console.log('🚀 FHIR Patient API - Caching and Performance Example\n');

  // Example 1: Basic client with caching enabled
  console.log('1. Creating FHIR client with caching enabled...');
  
  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    cache: {
      enabled: true,
      maxSize: 10 * 1024 * 1024, // 10MB cache
      defaultTTL: 300000, // 5 minutes
      respectCacheHeaders: true,
      staleWhileRevalidate: true,
      strategy: 'adaptive', // Uses both LRU and HTTP caching
    },
    connectionPool: {
      maxConnections: 50,
      maxConnectionsPerHost: 10,
      connectionTimeout: 30000,
      idleTimeout: 60000,
      enableHttp2: true,
    },
  });

  try {
    // Example 2: Make requests to demonstrate caching
    console.log('\n2. Making patient requests to demonstrate caching...');
    
    const startTime = Date.now();
    
    // First request - will hit the server
    console.log('   First request (cache miss)...');
    const patients1 = await client.getPatients({ _count: 5 });
    const firstRequestTime = Date.now() - startTime;
    
    // Second identical request - should use cache
    console.log('   Second identical request (potential cache hit)...');
    const secondStartTime = Date.now();
    const patients2 = await client.getPatients({ _count: 5 });
    const secondRequestTime = Date.now() - secondStartTime;
    
    console.log(`   First request: ${firstRequestTime}ms`);
    console.log(`   Second request: ${secondRequestTime}ms`);
    console.log(`   Found ${patients1.total || 0} patients`);

    // Example 3: Show cache statistics
    console.log('\n3. Cache and performance statistics:');
    const stats = client.getStats();
    if (stats) {
      console.log('   Cache stats:', JSON.stringify(stats.cache, null, 2));
      console.log('   Connection pool stats:', JSON.stringify(stats.connectionPool, null, 2));
    }

    // Example 4: Cache management
    console.log('\n4. Cache management operations...');
    
    // Clear specific cache entries
    const invalidatedCount = client.invalidateCache('/Patient');
    console.log(`   Invalidated ${invalidatedCount} cache entries`);
    
    // Clear all cache
    client.clearCache();
    console.log('   Cleared all cache entries');

  } catch (error) {
    console.error('Error making requests:', error);
  } finally {
    // Clean up resources
    await client.destroy();
  }

  // Example 5: Standalone cache components
  console.log('\n5. Standalone cache components example...');
  
  // LRU Cache example
  console.log('   LRU Cache:');
  const lruCache = new LRUCache({
    maxSize: 1024 * 1024, // 1MB
    defaultTTL: 60000, // 1 minute
  });
  
  lruCache.set('patient-123', { id: '123', name: 'John Doe' });
  const cachedPatient = lruCache.get('patient-123');
  console.log('     Cached patient:', cachedPatient);
  console.log('     Cache stats:', lruCache.getStats());
  lruCache.destroy();

  // HTTP Cache example
  console.log('   HTTP Cache:');
  const httpCache = new HttpCache({
    maxSize: 1024 * 1024, // 1MB
    defaultTTL: 300000, // 5 minutes
    respectCacheHeaders: true,
    staleWhileRevalidate: true,
  });
  
  const httpResponse = {
    data: { resourceType: 'Patient', id: '123' },
    status: 200,
    statusText: 'OK',
    headers: {
      'cache-control': 'max-age=300',
      'etag': '"abc123"',
    },
  };
  
  httpCache.set('patient-123', httpResponse);
  const cachedResponse = httpCache.get('patient-123');
  console.log('     Cached response:', cachedResponse?.data);
  
  const validationHeaders = httpCache.getValidationHeaders('patient-123');
  console.log('     Validation headers:', validationHeaders);
  httpCache.destroy();

  // Cache Manager example
  console.log('   Cache Manager (Adaptive Strategy):');
  const cacheManager = new CacheManager({
    enabled: true,
    maxSize: 2 * 1024 * 1024, // 2MB
    defaultTTL: 300000, // 5 minutes
    respectCacheHeaders: true,
    staleWhileRevalidate: true,
    strategy: 'adaptive',
  });
  
  await cacheManager.set('patient-456', httpResponse);
  const managerResponse = await cacheManager.get('patient-456');
  console.log('     Manager cached response:', managerResponse?.data);
  console.log('     Manager stats:', cacheManager.getStats());
  cacheManager.destroy();

  // Connection Pool example
  console.log('   Connection Pool:');
  const connectionPool = new ConnectionPool({
    maxConnections: 20,
    maxConnectionsPerHost: 5,
    connectionTimeout: 10000,
    idleTimeout: 30000,
    enableHttp2: false, // Disable for example
  });
  
  console.log('     Pool stats:', connectionPool.getStats());
  await connectionPool.destroy();

  // Example 6: Performance benchmarking
  console.log('\n6. Running performance benchmarks...');
  
  const benchmark = new PerformanceBenchmark();
  
  try {
    console.log('   Running cache benchmarks (this may take a moment)...');
    const cacheBenchmarks = await benchmark.runCacheBenchmarks();
    
    console.log(`   Benchmark suite: ${cacheBenchmarks.name}`);
    console.log(`   Total duration: ${cacheBenchmarks.totalDuration.toFixed(2)}ms`);
    console.log(`   Total operations: ${cacheBenchmarks.summary.totalOperations}`);
    console.log(`   Average ops/sec: ${cacheBenchmarks.summary.averageOpsPerSecond.toFixed(2)}`);
    console.log(`   Memory efficiency: ${cacheBenchmarks.summary.memoryEfficiency.toFixed(2)} ops/MB`);
    
    // Show top 3 benchmark results
    console.log('\n   Top performing operations:');
    const sortedResults = cacheBenchmarks.results
      .filter(r => r.operations > 0)
      .sort((a, b) => b.operationsPerSecond - a.operationsPerSecond)
      .slice(0, 3);
    
    sortedResults.forEach((result, index) => {
      console.log(`     ${index + 1}. ${result.name}: ${result.operationsPerSecond.toFixed(2)} ops/sec`);
    });
    
  } catch (error) {
    console.error('   Benchmark error:', error);
  }

  console.log('\n✅ Example completed successfully!');
  console.log('\nKey features demonstrated:');
  console.log('• LRU cache with TTL and memory management');
  console.log('• HTTP cache header compliance and validation');
  console.log('• Connection pooling with HTTP/2 support');
  console.log('• Adaptive caching strategy');
  console.log('• Performance benchmarking and statistics');
  console.log('• Cache invalidation and management');
  console.log('• Resource cleanup and memory efficiency');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runCachingPerformanceExample };