/**
 * FHIR Patient API - Authentication Example
 * 
 * This example demonstrates authentication methods supported by the
 * FHIR Patient API. Note: The main task uses public servers that don't require authentication.
 */

import { 
  FHIRClient,
  getPatients,
  FHIRAuthenticationError,
  FHIRServerError
} from '../src/index';

async function main() {
  console.log('🚀 FHIR Patient API - Authentication Example\n');
  console.log('Note: The main task uses public FHIR servers that don\'t require authentication.\n');

  // Example 1: No authentication (public servers) - Main use case for this task
  await demonstrateNoAuth();
  
  // Example 2: Bearer token authentication (for secured servers)
  await demonstrateBearerAuth();
  
  // Example 3: JWT authentication (for secured servers)
  await demonstrateJWT();
  
  console.log('\n✅ Authentication examples completed!');
}

async function demonstrateNoAuth() {
  console.log('1. No Authentication (Public Servers) - Main Use Case\n');

  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4', // Public HAPI FHIR server
    auth: { type: 'none' }
  });

  try {
    console.log('   Testing public server access...');
    const patients = await getPatients(client, { _count: 3 });
    console.log(`   ✅ Successfully accessed public server: ${patients.entry?.length || 0} patients`);
    
    if (patients.entry && patients.entry.length > 0) {
      const firstPatient = patients.entry[0].resource;
      if (firstPatient) {
        const name = firstPatient.name?.[0];
        const displayName = name ? 
          `${name.given?.join(' ')} ${name.family}` : 
          'Name not available';
        console.log(`   First patient: ${displayName} (ID: ${firstPatient.id})`);
      }
    }
    
  } catch (error) {
    console.error(`   ❌ Public server access failed: ${error}`);
  } finally {
    await client.destroy();
  }
}

async function demonstrateBearerAuth() {
  console.log('\n2. Bearer Token Authentication (For Secured Servers)\n');

  // Note: Using public server for demo, but showing how bearer auth would work
  const bearerClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    auth: {
      type: 'bearer',
      token: 'demo-bearer-token-12345'
    }
  });

  try {
    console.log('   Testing with bearer token...');
    const patients = await getPatients(bearerClient, { _count: 2 });
    console.log(`   ✅ Bearer token request succeeded: ${patients.entry?.length || 0} patients`);
    console.log('   (Note: HAPI server doesn\'t enforce auth, so this works for demo)');
    
  } catch (error) {
    if (error instanceof FHIRAuthenticationError || 
        (error instanceof FHIRServerError && error.statusCode === 401)) {
      console.log('   ❌ Bearer token authentication failed (expected for secured servers)');
    } else {
      console.log(`   ❌ Unexpected error: ${error}`);
    }
  } finally {
    await bearerClient.destroy();
  }
}

async function demonstrateJWT() {
  console.log('\n3. JWT Authentication (For Secured Servers)\n');

  // Example JWT token (in real use, this would be properly signed)
  const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.demo-signature';

  const jwtClient = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4',
    auth: {
      type: 'jwt',
      token: jwtToken
    }
  });

  try {
    console.log('   Testing with JWT token...');
    const patients = await getPatients(jwtClient, { _count: 2 });
    console.log(`   ✅ JWT request succeeded: ${patients.entry?.length || 0} patients`);
    console.log('   (Note: HAPI server doesn\'t enforce auth, so this works for demo)');
    
  } catch (error) {
    if (error instanceof FHIRAuthenticationError || 
        (error instanceof FHIRServerError && error.statusCode === 401)) {
      console.log('   ❌ JWT authentication failed (expected for secured servers)');
    } else {
      console.log(`   ❌ Unexpected error: ${error}`);
    }
  } finally {
    await jwtClient.destroy();
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runAuthenticationExample };