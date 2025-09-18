/**
 * FHIR Patient API - Error Handling Example
 * 
 * This example demonstrates comprehensive error handling strategies including
 * different error types, retry mechanisms, circuit breakers, and recovery patterns.
 */

import {
  FHIRClient,
  getPatients,
  getPatientById,
  FHIRServerError,
  FHIRNetworkError,
  FHIRValidationError,
  FHIRAuthenticationError,
  FHIRError
} from '../src/index';

async function main() {
  console.log('🚀 FHIR Patient API - Error Handling Example\n');

  // Example 1: Basic error handling with different error types
  await demonstrateBasicErrorHandling();

  // Example 2: Retry mechanisms and resilience patterns
  await demonstrateRetryMechanisms();

  // Example 3: Circuit breaker pattern
  await demonstrateCircuitBreaker();

  // Example 4: Graceful degradation
  await demonstrateGracefulDegradation();

  // Example 5: Error recovery strategies
  await demonstrateErrorRecovery();

  console.log('\n✅ Error handling example completed successfully!');
}

async function demonstrateBasicErrorHandling() {
  console.log('1. Basic Error Handling...\n');

  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    timeout: 10000,
    retryAttempts: 1 // Minimal retries for demonstration
  });

  try {
    // Example 1.1: Handle 404 Not Found errors
    console.log('   1.1 Testing 404 Not Found error...');

    try {
      await getPatientById(client, 'definitely-not-a-real-patient-id-12345');
    } catch (error) {
      if (error instanceof FHIRServerError) {
        console.log(`   ✅ Caught FHIRServerError: ${error.statusCode} - ${error.message}`);

        if (error.statusCode === 404) {
          console.log('   → Patient not found, this is expected');
        }

        if (error.operationOutcome) {
          console.log('   → Operation Outcome:', JSON.stringify(error.operationOutcome, null, 2));
        }
      }
    }

    // Example 1.2: Handle validation errors
    console.log('\n   1.2 Testing validation error...');

    try {
      // Try to use an invalid search parameter
      await client.patients()
        .where('family' as any, 'some-value') // Cast to any for demo
        .execute();
    } catch (error) {
      if (error instanceof FHIRServerError) {
        console.log(`   ✅ Caught validation error: ${error.statusCode} - ${error.message}`);
      } else if (error instanceof FHIRValidationError) {
        console.log(`   ✅ Caught FHIRValidationError: ${error.message}`);
        console.log('   → Validation details:', error.details);
      }
    }

    // Example 1.3: Handle timeout errors
    console.log('\n   1.3 Testing timeout error...');

    const shortTimeoutClient = new FHIRClient({
      baseUrl: 'https://hapi.fhir.org/baseR4',
      timeout: 1, // 1ms timeout - guaranteed to fail
      retryAttempts: 0
    });

    try {
      await getPatients(shortTimeoutClient, { _count: 5 });
    } catch (error) {
      if (error instanceof FHIRNetworkError) {
        console.log(`   ✅ Caught FHIRNetworkError: ${error.message}`);
        console.log('   → Original error:', error.originalError.message);
      }
    } finally {
      await shortTimeoutClient.destroy();
    }

    // Example 1.4: Handle authentication errors
    console.log('\n   1.4 Testing authentication error...');

    const authClient = new FHIRClient({
      baseUrl: 'https://hapi.fhir.org/baseR4',
      auth: {
        type: 'bearer',
        token: 'invalid-token-12345'
      }
    });

    try {
      await getPatients(authClient, { _count: 5 });
    } catch (error) {
      if (error instanceof FHIRAuthenticationError) {
        console.log(`   ✅ Caught FHIRAuthenticationError: ${error.message}`);
      } else if (error instanceof FHIRServerError && error.statusCode === 401) {
        console.log(`   ✅ Caught authentication error via server error: ${error.message}`);
      }
    } finally {
      await authClient.destroy();
    }

  } finally {
    await client.destroy();
  }
}

async function demonstrateRetryMechanisms() {
  console.log('\n2. Retry Mechanisms and Resilience...\n');

  // Example 2.1: Built-in retry configuration
  console.log('   2.1 Built-in retry configuration...');

  const retryClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    retryAttempts: 3,
    retryDelay: 1000 // 1 second base delay
  });

  try {
    // This should succeed with retries
    const patients = await getPatients(retryClient, { _count: 5 });
    console.log(`   ✅ Successfully retrieved ${patients.entry?.length || 0} patients with retry configuration`);
  } catch (error) {
    console.log(`   ❌ Failed even with retries: ${error}`);
  } finally {
    await retryClient.destroy();
  }

  // Example 2.2: Custom retry logic
  console.log('\n   2.2 Custom retry logic...');

  async function retryWithCustomLogic<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`      Attempt ${attempt}/${maxRetries}...`);
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          console.log(`      ❌ All ${maxRetries} attempts failed`);
          throw error;
        }

        // Determine if error is retryable
        const isRetryable = isRetryableError(error);
        if (!isRetryable) {
          console.log(`      ❌ Non-retryable error, stopping attempts`);
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`      ⏳ Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  function isRetryableError(error: any): boolean {
    if (error instanceof FHIRNetworkError) {
      return true; // Network errors are usually retryable
    }

    if (error instanceof FHIRServerError) {
      // Retry on server errors, rate limiting, and service unavailable
      return [429, 500, 502, 503, 504].includes(error.statusCode);
    }

    if (error instanceof FHIRAuthenticationError) {
      return false; // Don't retry auth errors without fixing the token
    }

    return false; // Don't retry other errors
  }

  const basicClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    retryAttempts: 0 // Disable built-in retries to test custom logic
  });

  try {
    const patients = await retryWithCustomLogic(
      () => getPatients(basicClient, { _count: 5 }),
      3,
      500
    );
    console.log(`   ✅ Custom retry succeeded, got ${patients.entry?.length || 0} patients`);
  } catch (error) {
    console.log(`   ❌ Custom retry failed: ${error}`);
  } finally {
    await basicClient.destroy();
  }
}

async function demonstrateCircuitBreaker() {
  console.log('\n3. Circuit Breaker Pattern...\n');

  // Example 3.1: Built-in circuit breaker
  console.log('   3.1 Built-in circuit breaker...');

  const circuitBreakerClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    retryAttempts: 3 // Use retry attempts instead of circuit breaker for demo
  });

  try {
    // Make some requests to test circuit breaker
    for (let i = 1; i <= 5; i++) {
      try {
        console.log(`      Request ${i}...`);
        const patients = await getPatients(circuitBreakerClient, { _count: 2 });
        console.log(`      ✅ Request ${i} succeeded (${patients.entry?.length || 0} patients)`);
      } catch (error) {
        console.log(`      ❌ Request ${i} failed: ${error.message}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Check client stats (circuit breaker not implemented in this demo)
    console.log('   Circuit breaker demo completed (simplified for example)');

  } finally {
    await circuitBreakerClient.destroy();
  }

  // Example 3.2: Custom circuit breaker implementation
  console.log('\n   3.2 Custom circuit breaker implementation...');

  class SimpleCircuitBreaker {
    private failures = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    constructor(
      private failureThreshold: number = 3,
      private resetTimeout: number = 5000
    ) { }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
      if (this.state === 'open') {
        if (Date.now() - this.lastFailureTime > this.resetTimeout) {
          this.state = 'half-open';
          console.log('      🔄 Circuit breaker moving to half-open state');
        } else {
          throw new Error('Circuit breaker is open');
        }
      }

      try {
        const result = await operation();

        if (this.state === 'half-open') {
          this.state = 'closed';
          this.failures = 0;
          console.log('      ✅ Circuit breaker closed after successful half-open request');
        }

        return result;
      } catch (error) {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.failures >= this.failureThreshold) {
          this.state = 'open';
          console.log(`      🔴 Circuit breaker opened after ${this.failures} failures`);
        }

        throw error;
      }
    }

    getState() {
      return {
        state: this.state,
        failures: this.failures,
        lastFailureTime: this.lastFailureTime
      };
    }
  }

  const simpleClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4'
  });

  const circuitBreaker = new SimpleCircuitBreaker(2, 3000);

  try {
    for (let i = 1; i <= 6; i++) {
      try {
        console.log(`      Custom CB Request ${i}...`);

        const patients = await circuitBreaker.execute(() =>
          getPatients(simpleClient, { _count: 2 })
        );

        console.log(`      ✅ Request ${i} succeeded (${patients.entry?.length || 0} patients)`);
      } catch (error) {
        console.log(`      ❌ Request ${i} failed: ${error.message}`);
      }

      console.log(`      State: ${circuitBreaker.getState().state}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally {
    await simpleClient.destroy();
  }
}

async function demonstrateGracefulDegradation() {
  console.log('\n4. Graceful Degradation...\n');

  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    cache: {
      enabled: true,
      maxSize: 10 * 1024 * 1024, // 10MB cache
      defaultTTL: 300000, // 5 minutes
      respectCacheHeaders: true,
      staleWhileRevalidate: true,
      strategy: 'lru' as const
    }
  });

  try {
    // Example 4.1: Fallback to cached data
    console.log('   4.1 Fallback to cached data...');

    const getPatientsWithFallback = async (limit: number = 10) => {
      try {
        // Try to get fresh data
        console.log('      Attempting to fetch fresh data...');
        const patients = await getPatients(client, { _count: limit });
        console.log(`      ✅ Got fresh data: ${patients.entry?.length || 0} patients`);
        return patients;
      } catch (error) {
        console.log(`      ❌ Fresh data failed: ${error.message}`);

        // Try to get cached data
        console.log('      Attempting to use cached data...');
        try {
          // For demo, we'll simulate cached data
          const cachedData = {
            resourceType: 'Bundle' as const,
            type: 'searchset' as const,
            total: 5,
            entry: [
              { resource: { resourceType: 'Patient' as const, id: 'cached-1', name: [{ family: 'Cached', given: ['Patient'] }] } },
              { resource: { resourceType: 'Patient' as const, id: 'cached-2', name: [{ family: 'Cached', given: ['Patient'] }] } }
            ]
          };

          console.log(`      ✅ Using cached data: ${cachedData.entry.length} patients`);
          return cachedData;
        } catch (cacheError) {
          console.log(`      ❌ Cached data also failed: ${cacheError}`);

          // Return minimal fallback data
          console.log('      Using minimal fallback data...');
          return {
            resourceType: 'Bundle' as const,
            type: 'searchset' as const,
            total: 0,
            entry: []
          };
        }
      }
    }

    const result = await getPatientsWithFallback(5);
    console.log(`   Final result: ${result.entry?.length || 0} patients`);

    // Example 4.2: Partial functionality degradation
    console.log('\n   4.2 Partial functionality degradation...');

    const getPatientWithPartialData = async (patientId: string) => {
      try {
        // Try to get full patient data
        const patient = await getPatientById(client, patientId);
        console.log('      ✅ Got full patient data');
        return patient;
      } catch (error) {
        console.log(`      ❌ Full data failed: ${error.message}`);

        // Try to get basic patient data only
        try {
          const basicPatient = await client.query('Patient', {
            _id: patientId,
            _elements: 'id,name,gender,birthDate' // Only essential fields
          });

          if (basicPatient.entry && basicPatient.entry.length > 0) {
            console.log('      ✅ Got basic patient data');
            return basicPatient.entry[0].resource;
          }
        } catch (basicError) {
          console.log(`      ❌ Basic data also failed: ${basicError.message}`);
        }

        // Return minimal patient object
        console.log('      Using minimal patient data...');
        return {
          resourceType: 'Patient' as const,
          id: patientId,
          name: [{ family: 'Unknown', given: ['Patient'] }]
        };
      }
    }

    // Test with a real patient ID from previous queries
    const testPatients = await getPatients(client, { _count: 1 });
    const testPatientId = testPatients.entry?.[0]?.resource?.id;

    if (testPatientId) {
      const partialResult = await getPatientWithPartialData(testPatientId);
      console.log(`   Partial result for patient ${testPatientId}: ${(partialResult as any)?.name?.[0]?.family}`);
    }

  } finally {
    await client.destroy();
  }
}

async function demonstrateErrorRecovery() {
  console.log('\n5. Error Recovery Strategies...\n');

  // Example 5.1: Token refresh on authentication error
  console.log('   5.1 Token refresh on authentication error...');

  class TokenManager {
    private token = 'initial-token';
    private refreshCount = 0;

    async getToken(): Promise<string> {
      return this.token;
    }

    async refreshToken(): Promise<void> {
      this.refreshCount++;
      this.token = `refreshed-token-${this.refreshCount}`;
      console.log(`      🔄 Token refreshed (attempt ${this.refreshCount})`);
    }

    getRefreshCount(): number {
      return this.refreshCount;
    }
  }

  const tokenManager = new TokenManager();

  const authClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    auth: {
      type: 'bearer',
      token: 'demo-token' // Simplified for demo
    }
  });

  async function operationWithTokenRefresh<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FHIRAuthenticationError ||
        (error instanceof FHIRServerError && error.statusCode === 401)) {

        console.log('      Authentication failed, attempting token refresh...');
        await tokenManager.refreshToken();

        // Retry once with new token
        return await operation();
      }

      throw error;
    }
  }

  try {
    const patients = await operationWithTokenRefresh(() =>
      getPatients(authClient, { _count: 3 })
    );
    console.log(`   ✅ Operation succeeded with token refresh: ${patients.entry?.length || 0} patients`);
  } catch (error) {
    console.log(`   ❌ Operation failed even after token refresh: ${error.message}`);
  } finally {
    await authClient.destroy();
  }

  // Example 5.2: Automatic failover to backup server
  console.log('\n   5.2 Automatic failover to backup server...');

  class FailoverClient {
    private currentServerIndex = 0;
    private servers = [
      'https://hapi.fhir.org/baseR4',
      'https://r4.smarthealthit.org', // Backup server
      'https://launch.smarthealthit.org/v/r4/fhir' // Another backup
    ];

    async executeWithFailover<T>(operation: (client: FHIRClient) => Promise<T>): Promise<T> {
      for (let attempt = 0; attempt < this.servers.length; attempt++) {
        const serverUrl = this.servers[this.currentServerIndex];
        console.log(`      Trying server ${this.currentServerIndex + 1}: ${serverUrl}`);

        const client = new FHIRClient({
          baseUrl: serverUrl,
          timeout: 10000,
          retryAttempts: 1
        });

        try {
          const result = await operation(client);
          console.log(`      ✅ Server ${this.currentServerIndex + 1} succeeded`);
          return result;
        } catch (error) {
          console.log(`      ❌ Server ${this.currentServerIndex + 1} failed: ${error.message}`);

          // Move to next server
          this.currentServerIndex = (this.currentServerIndex + 1) % this.servers.length;

          if (attempt === this.servers.length - 1) {
            throw new Error(`All ${this.servers.length} servers failed`);
          }
        } finally {
          await client.destroy();
        }
      }

      throw new Error('Failover exhausted');
    }
  }

  const failoverClient = new FailoverClient();

  try {
    const patients = await failoverClient.executeWithFailover(client =>
      getPatients(client, { _count: 3 })
    );
    console.log(`   ✅ Failover succeeded: ${patients.entry?.length || 0} patients`);
  } catch (error) {
    console.log(`   ❌ All servers failed: ${error.message}`);
  }

  // Example 5.3: Error aggregation and reporting
  console.log('\n   5.3 Error aggregation and reporting...');

  class ErrorReporter {
    private errors: Array<{ timestamp: Date; error: any; context: any }> = [];

    reportError(error: any, context: any): void {
      this.errors.push({
        timestamp: new Date(),
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          type: error.constructor.name
        },
        context
      });
    }

    getErrorSummary() {
      const errorTypes = new Map<string, number>();
      const statusCodes = new Map<number, number>();

      this.errors.forEach(({ error }) => {
        // Count error types
        const type = error.type || 'Unknown';
        errorTypes.set(type, (errorTypes.get(type) || 0) + 1);

        // Count status codes
        if (error.statusCode) {
          statusCodes.set(error.statusCode, (statusCodes.get(error.statusCode) || 0) + 1);
        }
      });

      return {
        totalErrors: this.errors.length,
        errorTypes: Object.fromEntries(errorTypes),
        statusCodes: Object.fromEntries(statusCodes),
        recentErrors: this.errors.slice(-5) // Last 5 errors
      };
    }
  }

  const errorReporter = new ErrorReporter();
  const reportingClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4'
  });

  // Simulate various operations that might fail
  const operations = [
    () => getPatients(reportingClient, { _count: 5 }),
    () => getPatientById(reportingClient, 'non-existent-id'),
    () => reportingClient.patients().where('family' as any, 'value').execute(),
    () => getPatients(reportingClient, { _count: 3 })
  ];

  for (let i = 0; i < operations.length; i++) {
    try {
      console.log(`      Operation ${i + 1}...`);
      await operations[i]();
      console.log(`      ✅ Operation ${i + 1} succeeded`);
    } catch (error) {
      console.log(`      ❌ Operation ${i + 1} failed`);
      errorReporter.reportError(error, { operation: i + 1, timestamp: new Date() });
    }
  }

  const summary = errorReporter.getErrorSummary();
  console.log('   Error Summary:', JSON.stringify(summary, null, 2));

  await reportingClient.destroy();
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runErrorHandlingExample };