/**
 * FHIR Patient API - Basic Usage Example
 * 
 * This example demonstrates the fundamental features of the FHIR Patient API,
 * including client initialization, simple queries, and basic error handling.
 * Perfect for developers getting started with the library.
 */

import { 
  FHIRClient, 
  getPatients, 
  getPatientById, 
  searchPatients,
  FHIRServerError,
  FHIRNetworkError
} from '../src/index';

async function main() {
  console.log('🚀 FHIR Patient API - Basic Usage Example\n');

  // Example 1: Initialize FHIR Client
  console.log('1. Initializing FHIR Client...');
  
  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4', // Public HAPI FHIR test server
    timeout: 30000, // 30 seconds timeout
    retryAttempts: 3 // Retry failed requests up to 3 times
  });

  try {
    // Example 2: Simple function API - Get patients with basic parameters
    console.log('\n2. Using Simple Function API...');
    
    console.log('   Getting first 5 patients...');
    const firstPatients = await getPatients(client, { _count: 5 });
    console.log(`   ✅ Found ${firstPatients.total || 0} total patients, showing ${firstPatients.entry?.length || 0}`);
    
    // Display basic info about each patient
    firstPatients.entry?.forEach((entry, index) => {
      const patient = entry.resource;
      if (patient) {
        const name = patient.name?.[0];
        const displayName = name ? `${name.given?.join(' ')} ${name.family}` : 'Unknown';
        console.log(`      ${index + 1}. ${displayName} (ID: ${patient.id})`);
      }
    });

    // Example 3: Search patients with specific criteria
    console.log('\n3. Searching patients with criteria...');
    
    const searchResults = await searchPatients(client, {
      active: true,
      _count: 3,
      _sort: '-_lastUpdated' // Most recently updated first
    });
    
    console.log(`   ✅ Found ${searchResults.entry?.length || 0} active patients`);
    searchResults.entry?.forEach((entry, index) => {
      const patient = entry.resource;
      if (patient) {
        const name = patient.name?.[0];
        const displayName = name ? `${name.given?.join(' ')} ${name.family}` : 'Unknown';
        const lastUpdated = patient.meta?.lastUpdated ? 
          new Date(patient.meta.lastUpdated).toLocaleDateString() : 'Unknown';
        console.log(`      ${index + 1}. ${displayName} (Last updated: ${lastUpdated})`);
      }
    });

    // Example 4: Get a specific patient by ID
    console.log('\n4. Getting specific patient by ID...');
    
    // Use the first patient's ID from our previous search
    const firstPatientId = firstPatients.entry?.[0]?.resource?.id;
    
    if (firstPatientId) {
      console.log(`   Fetching patient with ID: ${firstPatientId}`);
      const specificPatient = await getPatientById(client, firstPatientId);
      
      const name = specificPatient.name?.[0];
      const displayName = name ? `${name.given?.join(' ')} ${name.family}` : 'Unknown';
      
      console.log(`   ✅ Patient Details:`);
      console.log(`      Name: ${displayName}`);
      console.log(`      Gender: ${specificPatient.gender || 'Unknown'}`);
      console.log(`      Birth Date: ${specificPatient.birthDate || 'Unknown'}`);
      console.log(`      Active: ${specificPatient.active !== false ? 'Yes' : 'No'}`);
      
      // Show contact information if available
      if (specificPatient.telecom && specificPatient.telecom.length > 0) {
        console.log(`      Contact:`);
        specificPatient.telecom.forEach(contact => {
          if (contact.system && contact.value) {
            console.log(`        ${contact.system}: ${contact.value}`);
          }
        });
      }
      
      // Show address if available
      if (specificPatient.address && specificPatient.address.length > 0) {
        const address = specificPatient.address[0];
        const addressLine = [
          ...(address.line || []),
          address.city,
          address.state,
          address.postalCode,
          address.country
        ].filter(Boolean).join(', ');
        
        if (addressLine) {
          console.log(`      Address: ${addressLine}`);
        }
      }
    } else {
      console.log('   ⚠️  No patient ID available from previous search');
    }

    // Example 5: Fluent Query Builder API
    console.log('\n5. Using Fluent Query Builder API...');
    
    console.log('   Building complex query with method chaining...');
    const complexQuery = await client.patients()
      .where('active', true)
      .limit(10)
      .sort('family', 'asc')
      .execute();
    
    console.log(`   ✅ Query executed successfully, found ${complexQuery.entry?.length || 0} patients`);
    
    // Show the query URL that was built
    const queryBuilder = client.patients()
      .where('active', true)
      .limit(10)
      .sort('family', 'asc');
    
    console.log(`   Query URL: ${queryBuilder.buildUrl()}`);

    // Example 6: Different search parameters
    console.log('\n6. Demonstrating different search parameters...');
    
    // Search by family name
    console.log('   Searching by family name "Smith"...');
    const smithPatients = await client.patients()
      .where('family', 'Smith')
      .limit(5)
      .execute();
    console.log(`   Found ${smithPatients.entry?.length || 0} patients with family name "Smith"`);
    
    // Search by gender
    console.log('   Searching for female patients...');
    const femalePatients = await client.patients()
      .where('gender', 'female')
      .limit(5)
      .execute();
    console.log(`   Found ${femalePatients.entry?.length || 0} female patients`);
    
    // Search by birth date range
    console.log('   Searching for patients born after 1990...');
    const recentPatients = await client.patients()
      .where('birthdate', 'gt1990-01-01')
      .limit(5)
      .execute();
    console.log(`   Found ${recentPatients.entry?.length || 0} patients born after 1990`);

    // Example 7: Using count() method
    console.log('\n7. Getting patient counts...');
    
    const totalActivePatients = await client.patients()
      .where('active', true)
      .count();
    console.log(`   Total active patients: ${totalActivePatients}`);

    // Example 8: Using first() method
    console.log('\n8. Getting first matching patient...');
    
    const firstActivePatient = await client.patients()
      .where('active', true)
      .first();
    
    if (firstActivePatient) {
      const name = firstActivePatient.name?.[0];
      const displayName = name ? `${name.given?.join(' ')} ${name.family}` : 'Unknown';
      console.log(`   First active patient: ${displayName} (ID: ${firstActivePatient.id})`);
    } else {
      console.log('   No active patients found');
    }

    // Example 9: Pagination demonstration
    console.log('\n9. Demonstrating pagination...');
    
    console.log('   Fetching first page (5 patients)...');
    const page1 = await client.patients()
      .limit(5)
      .execute();
    
    console.log(`   Page 1: ${page1.entry?.length || 0} patients`);
    
    // Check if there are more pages
    const hasNextPage = page1.link?.some(link => link.relation === 'next');
    console.log(`   Has next page: ${hasNextPage ? 'Yes' : 'No'}`);
    
    if (hasNextPage) {
      console.log('   Fetching second page...');
      const page2 = await client.patients()
        .limit(5)
        .where('_offset', '5')
        .execute();
      
      console.log(`   Page 2: ${page2.entry?.length || 0} patients`);
    }

  } catch (error) {
    console.error('\n❌ Error occurred during example execution:');
    
    if (error instanceof FHIRServerError) {
      console.error(`   Server Error (${error.statusCode}): ${error.message}`);
      if (error.operationOutcome) {
        console.error('   Operation Outcome:', JSON.stringify(error.operationOutcome, null, 2));
      }
    } else if (error instanceof FHIRNetworkError) {
      console.error(`   Network Error: ${error.message}`);
      console.error('   Original Error:', error.originalError.message);
    } else {
      console.error(`   Unexpected Error: ${error}`);
    }
  } finally {
    // Always clean up resources
    console.log('\n🧹 Cleaning up resources...');
    await client.destroy();
  }

  console.log('\n✅ Basic usage example completed successfully!');
  console.log('\nKey concepts demonstrated:');
  console.log('• Client initialization and configuration');
  console.log('• Simple function API (getPatients, getPatientById, searchPatients)');
  console.log('• Fluent query builder API with method chaining');
  console.log('• Different search parameters (active, family, gender, birthdate)');
  console.log('• Pagination with limit and offset');
  console.log('• Count and first result methods');
  console.log('• Basic error handling');
  console.log('• Resource cleanup');
}

// Helper function to demonstrate error handling
async function demonstrateErrorHandling(client: FHIRClient) {
  console.log('\n10. Demonstrating error handling...');
  
  try {
    // Try to get a patient with an invalid ID
    console.log('   Attempting to fetch patient with invalid ID...');
    await getPatientById(client, 'definitely-not-a-real-patient-id');
  } catch (error) {
    if (error instanceof FHIRServerError && error.statusCode === 404) {
      console.log('   ✅ Correctly handled 404 error for non-existent patient');
    } else {
      console.log('   ⚠️  Unexpected error type:', error);
    }
  }
  
  try {
    // Try to use an invalid search parameter
    console.log('   Attempting query with invalid parameter...');
    await client.patients()
      .where('family' as any, 'some-value') // Cast to any to demonstrate error handling
      .execute();
  } catch (error) {
    console.log('   ✅ Correctly handled invalid parameter error');
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runBasicUsageExample };