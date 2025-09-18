#!/usr/bin/env node

/**
 * Simple Test - Shows Real FHIR Data in 30 seconds
 * 
 * Run: node simple-test.js
 */

const { FHIRClient } = require('./dist/index.js');

async function quickTest() {
  console.log('🚀 Quick Test - Fetching Real FHIR Data...\n');

  const client = new FHIRClient({
    baseUrl: 'https://hapi.fhir.org/baseR4'
  });

  try {
    // Test 1: Get patients using fluent API
    console.log('1️⃣ Testing Fluent API...');
    const patients = await client.patients()
      .where('gender', 'male')
      .limit(3)
      .execute();

    console.log(`   ✅ Found ${patients.entry?.length} male patients`);
    
    // Show first patient's real data
    if (patients.entry?.[0]?.resource) {
      const patient = patients.entry[0].resource;
      const name = patient.name?.[0];
      const displayName = name ? 
        `${name.given?.join(' ')} ${name.family}` : 
        'Name not available';
      
      console.log(`   📋 First patient: ${displayName} (ID: ${patient.id})`);
      console.log(`   🎂 Born: ${patient.birthDate || 'Unknown'}`);
      console.log(`   ⚧ Gender: ${patient.gender || 'Unknown'}`);
    }

    // Test 2: Raw query
    console.log('\n2️⃣ Testing Raw Query API...');
    const rawResults = await client.query('Patient', {
      _count: 2,
      gender: 'female'
    });

    console.log(`   ✅ Raw query found ${rawResults.entry?.length} female patients`);

    // Test 3: Get specific patient
    if (patients.entry?.[0]?.resource?.id) {
      console.log('\n3️⃣ Testing Get Patient by ID...');
      const specificPatient = await client.getPatientById(patients.entry[0].resource.id);
      console.log(`   ✅ Retrieved patient: ${specificPatient.id}`);
      console.log(`   📊 Resource type: ${specificPatient.resourceType}`);
    }

    console.log('\n🎉 All tests passed! The API is working with real FHIR data.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await client.destroy();
  }
}

quickTest();