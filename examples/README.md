# FHIR Patient API Examples

This directory contains comprehensive examples demonstrating various features and capabilities of the FHIR Patient API library. Each example is designed to be educational and practical, showing real-world usage patterns.

## Quick Start

```bash
# Run all examples
npm run examples

# Run a specific example
npm run examples basic-usage

# List available examples
npm run examples list

# Get help
npm run examples help
```

## Available Examples

### 🟢 Beginner Level

#### 1. Basic Usage (`basic-usage-example.ts`)
**Perfect for getting started with the library**

- Client initialization and configuration
- Simple function API (`getPatients`, `getPatientById`, `searchPatients`)
- Fluent query builder with method chaining
- Different search parameters (active, family, gender, birthdate)
- Pagination with limit and offset
- Count and first result methods
- Basic error handling
- Resource cleanup

```bash
npm run examples basic-usage
```

**Key concepts covered:**
- Setting up a FHIR client
- Making basic patient queries
- Understanding FHIR Bundle responses
- Handling common errors
- Proper resource management

### 🟡 Intermediate Level

#### 2. Advanced Queries (`advanced-queries-example.ts`)
**Complex search capabilities and query optimization**

- Multi-criteria searches with date ranges
- Text search with contains modifier
- Including related resources
- Identifier and address-based searches
- Streaming for large datasets
- Raw query interface
- Chained and reverse chained searches
- Summary and elements parameters
- Search modifiers (exact, missing, not)
- Performance measurement

```bash
npm run examples advanced-queries
```

**Key concepts covered:**
- Complex FHIR search parameters
- Query optimization techniques
- Handling large result sets
- Advanced FHIR search features

#### 3. Caching & Performance (`caching-performance-example.ts`)
**Performance optimization and caching strategies**

- LRU cache with TTL and memory management
- HTTP cache header compliance and validation
- Connection pooling with HTTP/2 support
- Adaptive caching strategy
- Performance benchmarking and statistics
- Cache invalidation and management
- Resource cleanup and memory efficiency

```bash
npm run examples caching-performance
```

**Key concepts covered:**
- Caching strategies for FHIR data
- Performance monitoring and optimization
- Memory management best practices
- Benchmarking and metrics collection

#### 4. Error Handling (`error-handling-example.ts`)
**Comprehensive error handling and resilience patterns**

- Different error types (Server, Network, Validation, Authentication)
- Retry mechanisms with exponential backoff
- Circuit breaker pattern implementation
- Graceful degradation strategies
- Error recovery and fallback patterns
- Custom retry logic
- Error aggregation and reporting

```bash
npm run examples error-handling
```

**Key concepts covered:**
- Robust error handling strategies
- Building resilient applications
- Implementing retry and fallback mechanisms
- Monitoring and reporting errors

#### 5. Authentication (`authentication-example.ts`)
**Various authentication methods and patterns**

- No authentication (public servers)
- Bearer token authentication (static and dynamic)
- OAuth 2.0 flows (client credentials, authorization code)
- Custom authentication methods (API keys, JWT)
- Token refresh patterns (proactive and reactive)
- Multi-tenant authentication

```bash
npm run examples authentication
```

**Key concepts covered:**
- FHIR server authentication methods
- Token lifecycle management
- Multi-tenant authentication patterns
- Security best practices

### 🔴 Advanced Level

#### 6. Extensibility (`extensibility-examples.ts`)
**Extending the library with new resources and plugins**

- Adding new FHIR resource types (Organization, Medication)
- Creating custom query builders
- Plugin system for middleware functionality
- Custom authentication plugins
- Rate limiting and caching plugins
- Resource factory patterns
- Multi-tenant client management

```bash
npm run examples extensibility
```

**Key concepts covered:**
- Extending the library for new use cases
- Plugin architecture and middleware
- Custom resource type support
- Advanced architectural patterns

## Running Examples

### Prerequisites

Make sure you have the FHIR Patient API installed and built:

```bash
cd fhir-patient-api
npm install
npm run build
```

### Individual Examples

Each example can be run individually:

```bash
# TypeScript (if you have ts-node installed)
npx ts-node examples/basic-usage-example.ts

# Or compile and run JavaScript
npm run build
node dist/examples/basic-usage-example.js
```

### All Examples

Run all examples in sequence:

```bash
npm run examples
# or
node examples/index.js
```

### Interactive Mode

The examples index provides an interactive way to explore:

```bash
node examples/index.js list    # List all examples
node examples/index.js help    # Show detailed help
```

## Example Structure

Each example follows a consistent structure:

```typescript
/**
 * Example Title - Brief Description
 * 
 * Detailed description of what the example demonstrates
 * and what concepts it covers.
 */

import { FHIRClient, ... } from '../src';

async function main() {
  console.log('🚀 Example Title\n');
  
  // Example sections with clear explanations
  // Example 1: Basic concept
  // Example 2: Advanced usage
  // etc.
  
  console.log('\n✅ Example completed successfully!');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as runExampleName };
```

## Learning Path

We recommend following this learning path:

1. **Start with Basic Usage** - Get familiar with the core concepts
2. **Explore Advanced Queries** - Learn complex search capabilities
3. **Study Error Handling** - Understand resilience patterns
4. **Learn Authentication** - Secure your applications
5. **Optimize Performance** - Implement caching and optimization
6. **Extend Functionality** - Add custom features and plugins

## Real-World Scenarios

The examples are designed around real-world scenarios:

- **Healthcare Application**: Fetching patient data for a medical dashboard
- **Research Platform**: Querying large datasets for analysis
- **Integration Service**: Connecting multiple FHIR servers
- **Mobile App**: Efficient data loading with caching
- **Enterprise System**: Multi-tenant authentication and error handling

## Testing with Different FHIR Servers

The examples primarily use public FHIR test servers:

- **HAPI FHIR**: `https://hapi.fhir.org/baseR4` (primary)
- **SMART Health IT**: `https://r4.smarthealthit.org`
- **Synthea**: `https://synthetichealth.github.io/synthea/`

To test with your own FHIR server, modify the `baseUrl` in the examples:

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-fhir-server.com/fhir',
  // ... other configuration
});
```

## Common Issues and Solutions

### Connection Timeouts
If you experience timeouts, increase the timeout value:

```typescript
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  timeout: 60000 // 60 seconds
});
```

### Rate Limiting
Some servers have rate limits. The examples include rate limiting patterns:

```typescript
// Built-in retry with backoff
const client = new FHIRClient({
  baseUrl: 'https://your-server.com/fhir',
  retries: 5,
  retryDelay: 2000
});
```

### Memory Issues
For large datasets, use streaming:

```typescript
// Instead of loading all data
const patients = await client.patients().execute();

// Use streaming
for await (const patient of client.patients().stream()) {
  // Process one patient at a time
}
```

## Contributing Examples

We welcome contributions of new examples! Please follow these guidelines:

1. **Clear Purpose**: Each example should demonstrate specific concepts
2. **Educational Value**: Include detailed comments and explanations
3. **Real-World Relevance**: Base examples on practical use cases
4. **Error Handling**: Show proper error handling patterns
5. **Resource Cleanup**: Always clean up resources
6. **Documentation**: Update this README with new examples

### Example Template

```typescript
/**
 * FHIR Patient API - [Example Name]
 * 
 * [Detailed description of what this example demonstrates]
 */

import { FHIRClient } from '../src';

async function main() {
  console.log('🚀 FHIR Patient API - [Example Name]\n');

  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4'
  });

  try {
    // Your example code here
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.destroy();
  }

  console.log('\n✅ Example completed successfully!');
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as runYourExampleName };
```

## Additional Resources

- [FHIR Patient API Documentation](../docs/API.md)
- [Troubleshooting Guide](../docs/TROUBLESHOOTING.md)
- [Best Practices](../docs/BEST_PRACTICES.md)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [FHIR Search Parameters](https://hl7.org/fhir/R4/search.html)

## Support

If you have questions about the examples or need help:

1. Check the [Troubleshooting Guide](../docs/TROUBLESHOOTING.md)
2. Review the [API Documentation](../docs/API.md)
3. Look at similar examples for patterns
4. Open an issue on GitHub with your question

Happy coding! 🚀