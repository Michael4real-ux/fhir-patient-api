# FHIR Patient API

A user-friendly JavaScript/TypeScript API for downloading patient data from any FHIR server.

## Features

- 🚀 Simple, intuitive API design
- 📝 Full TypeScript support with type safety
- 🔄 Multiple query interfaces (simple functions, fluent builder, raw queries)
- ⚡ Performance optimized with caching and connection pooling
- 🛡️ Robust error handling and retry mechanisms
- 🔌 Extensible architecture for future FHIR resources
- 📚 Comprehensive documentation and examples

## Installation

```bash
npm install fhir-patient-api
```

## Quick Start

```typescript
import { FHIRClient } from 'fhir-patient-api';

// Initialize client
const client = new FHIRClient({
  baseUrl: 'https://your-fhir-server.com/fhir',
  auth: {
    type: 'bearer',
    token: 'your-access-token'
  }
});

// Simple function API
const patients = await getPatients(client, { limit: 10 });

// Fluent query builder
const smithPatients = await client.patients()
  .where('family', 'Smith')
  .limit(50)
  .execute();
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build

# Run linting
npm run lint

# Format code
npm run format
```

## License

MIT