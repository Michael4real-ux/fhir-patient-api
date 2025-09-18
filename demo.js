#!/usr/bin/env node

/**
 * FHIR Patient API Demo
 * This demo shows real API calls to HAPI FHIR server
 */

const { FHIRClient, getPatients, getPatientById } = require('./dist/index.js');

async function runDemo() {
    console.log('🚀 FHIR Patient API Demo');
    console.log('This demo shows real API calls to HAPI FHIR server');
    console.log('============================================================\n');

    const client = new FHIRClient({
        baseUrl: 'https://hapi.fhir.org/baseR4'
    });

    try {
        // Demo 1: Simple Function API
        console.log('📋 Demo 1: Simple Function API');
        console.log('Making real HTTP request to FHIR server...');

        const patients = await getPatients(client, { _count: 3 });

        console.log(`✅ Found ${patients.total || 0} total patients`);
        console.log(`✅ Retrieved ${patients.entry?.length || 0} patients in this response`);

        if (patients.entry && patients.entry.length > 0) {
            const firstPatient = patients.entry[0].resource;
            if (firstPatient && firstPatient.name && firstPatient.name.length > 0) {
                const name = firstPatient.name[0];
                const displayName = `${name.given?.join(', ') || ''}, ${name.family || ''}`.replace(/^, |, $/, '');
                console.log(`✅ First patient: ${displayName}`);
                console.log(`✅ Patient ID: ${firstPatient.id}`);
                console.log(`✅ Gender: ${firstPatient.gender || 'not specified'}`);
            }
        }

        // Demo 2: Fluent Builder API
        console.log('\n📋 Demo 2: Fluent Builder API');
        console.log('Building complex query with method chaining...');

        const femalePatients = await client.patients()
            .where('gender', 'female')
            .limit(5)
            .execute();

        console.log(`✅ Found ${femalePatients.entry?.length || 0} female patients`);

        // Show query building
        const queryBuilder = client.patients()
            .where('family', 'Smith')
            .limit(3);

        console.log(`✅ Built query URL: ${queryBuilder.buildUrl()}`);

        // Demo 3: Raw Query API
        console.log('\n📋 Demo 3: Raw Query API');
        console.log('Making direct FHIR query...');

        const rawResults = await client.query('Patient', {
            _count: 2,
            gender: 'male'
        });

        console.log(`✅ Raw query found ${rawResults.entry?.length || 0} male patients`);

        // Demo 4: Get specific patient
        if (patients.entry && patients.entry.length > 0) {
            const patientId = patients.entry[0].resource?.id;
            if (patientId) {
                console.log('\n📋 Demo 4: Get Specific Patient');
                console.log(`Fetching patient with ID: ${patientId}...`);

                const specificPatient = await getPatientById(client, patientId);
                console.log(`✅ Retrieved patient: ${specificPatient.id}`);
                console.log(`✅ Resource type: ${specificPatient.resourceType}`);

                if (specificPatient.birthDate) {
                    console.log(`✅ Birth date: ${specificPatient.birthDate}`);
                }
            }
        }

        // Demo 5: Streaming API
        console.log('\n📋 Demo 5: Streaming API');
        console.log('Streaming patients (first 3)...');

        let streamCount = 0;
        for await (const patient of client.patients().stream({ pageSize: 5 })) {
            streamCount++;
            console.log(`✅ Streamed patient ${streamCount}: ${patient.name?.[0]?.family || 'N/A'} (${patient.id})`);

            if (streamCount >= 3) break; // Limit for demo
        }

        console.log('\n🎉 All demos completed successfully!');
        console.log('\nThis proves:');
        console.log('• ✅ Real HTTP requests to live FHIR server');
        console.log('• ✅ Multiple API interfaces working');
        console.log('• ✅ Actual patient data parsing');
        console.log('• ✅ Query building and streaming');

    } catch (error) {
        console.error(`❌ Demo failed with error: ${error.message}`);
        console.error(`Stack trace: ${error.stack}`);
    } finally {
        await client.destroy();
        console.log('🧹 Resources cleaned up');
    }
}

runDemo();