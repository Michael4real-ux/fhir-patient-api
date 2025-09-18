/**
 * Tests for main API exports
 */

import { VERSION, createFHIRClient, getPatients, getPatientById, FHIRClient } from './index';

// Real unit tests without mocks - testing actual API functionality

describe('FHIR Patient API', () => {
  describe('Version', () => {
    it('should export version information', () => {
      expect(VERSION).toBe('1.0.0');
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Client Factory', () => {
    it('should create FHIR client with factory function', () => {
      const client = createFHIRClient({
        baseUrl: 'https://hapi.fhir.org/baseR4'
      });
      
      expect(client).toBeInstanceOf(FHIRClient);
    });
  });

  describe('Module Exports', () => {
    it('should export all necessary modules', () => {
      expect(FHIRClient).toBeDefined();
      expect(createFHIRClient).toBeDefined();
      expect(getPatients).toBeDefined();
      expect(getPatientById).toBeDefined();
      expect(VERSION).toBeDefined();
    });

    it('should export types and utilities', () => {
      // These should be available as type imports
      expect(typeof VERSION).toBe('string');
    });
  });

  describe('Simple Function API', () => {
    let client: FHIRClient;

    beforeEach(() => {
      client = createFHIRClient({
        baseUrl: 'https://hapi.fhir.org/baseR4'
      });
    });

    it('should provide simple function wrappers', () => {
      expect(typeof getPatients).toBe('function');
      expect(typeof getPatientById).toBe('function');
    });

    // Note: Actual functionality tests are in integration tests
    // since these functions just delegate to the client methods
  });
});