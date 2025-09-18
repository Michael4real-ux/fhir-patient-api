/**
 * FHIR Patient API - Main entry point
 * 
 * A user-friendly JavaScript/TypeScript API for downloading patient data from any FHIR server.
 */

// Core exports - import directly from source modules to avoid circular dependencies
export * from './types';
export * from './errors';
export * from './auth';
export * from './http';
export * from './utils';
export * from './cache';
export * from './performance';

// Client exports - direct imports to avoid circular dependencies
export { FHIRClient } from './client/fhir-client';
export { PatientQueryBuilder } from './client/patient-query-builder';

// Simple function API exports
import { FHIRClient } from './client/fhir-client';
import { Patient, Bundle, PatientSearchParams, FHIRClientConfig } from './types';

/**
 * Create a new FHIR client instance
 * @param config - Client configuration
 * @returns Configured FHIR client
 */
export function createFHIRClient(config: FHIRClientConfig): FHIRClient {
  return new FHIRClient(config);
}

/**
 * Simple function to get patients from a FHIR server
 * @param client - Configured FHIR client
 * @param params - Optional search parameters
 * @returns Promise resolving to a Bundle of Patient resources
 */
export async function getPatients(
  client: FHIRClient, 
  params?: PatientSearchParams
): Promise<Bundle<Patient>> {
  return client.getPatients(params);
}

/**
 * Simple function to get a specific patient by ID
 * @param client - Configured FHIR client
 * @param id - Patient ID
 * @returns Promise resolving to a Patient resource
 */
export async function getPatientById(
  client: FHIRClient, 
  id: string
): Promise<Patient> {
  return client.getPatientById(id);
}

// Version information
export const VERSION = '1.0.0';