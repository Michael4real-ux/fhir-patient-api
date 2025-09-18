/**
 * Unit tests for FHIRClient
 */

import { FHIRClient } from './fhir-client';
import { PatientQueryBuilder } from './patient-query-builder';
import { FHIRClientConfig } from '../types';
import { ConfigurationError, FHIRValidationError } from '../errors';

// Mock the HTTP client and auth manager to avoid real network calls in unit tests
jest.mock('../http/http-client');
jest.mock('../auth/auth-manager');

describe('FHIRClient', () => {
  const validConfig: FHIRClientConfig = {
    baseUrl: 'https://hapi.fhir.org/baseR4',
  };

  describe('Constructor and Configuration', () => {
    it('should create client with valid configuration', () => {
      const client = new FHIRClient(validConfig);
      expect(client).toBeInstanceOf(FHIRClient);
    });

    it('should throw ConfigurationError for missing baseUrl', () => {
      expect(() => {
        new FHIRClient({} as FHIRClientConfig);
      }).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for invalid baseUrl', () => {
      expect(() => {
        new FHIRClient({ baseUrl: 'not-a-url' });
      }).toThrow(ConfigurationError);
    });

    it('should set default values for optional configuration', () => {
      const client = new FHIRClient(validConfig);
      const config = client.getConfig();

      expect(config.timeout).toBe(30000);
      expect(config.retryAttempts).toBe(3);
      expect(config.retryDelay).toBe(1000);
      expect(config.userAgent).toBe('fhir-patient-api/1.0.0');
      expect(config.validateSSL).toBe(true);
    });

    it('should remove trailing slash from baseUrl', () => {
      const client = new FHIRClient({ baseUrl: 'https://example.com/' });
      const config = client.getConfig();
      expect(config.baseUrl).toBe('https://example.com');
    });

    it('should validate timeout range', () => {
      expect(() => {
        new FHIRClient({ baseUrl: 'https://example.com', timeout: -1 });
      }).toThrow(ConfigurationError);

      expect(() => {
        new FHIRClient({ baseUrl: 'https://example.com', timeout: 400000 });
      }).toThrow(ConfigurationError);
    });

    it('should validate retry attempts range', () => {
      expect(() => {
        new FHIRClient({ baseUrl: 'https://example.com', retryAttempts: -1 });
      }).toThrow(ConfigurationError);

      expect(() => {
        new FHIRClient({ baseUrl: 'https://example.com', retryAttempts: 15 });
      }).toThrow(ConfigurationError);
    });
  });

  describe('Authentication Configuration', () => {
    it('should accept no authentication configuration', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com',
      };

      expect(() => new FHIRClient(config)).not.toThrow();
    });

    it('should accept none authentication type', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com',
        auth: {
          type: 'none',
        },
      };

      expect(() => new FHIRClient(config)).not.toThrow();
    });
  });

  describe('Parameter Validation', () => {
    let client: FHIRClient;

    beforeEach(() => {
      client = new FHIRClient(validConfig);
    });

    it('should validate patient ID for getPatientById', async () => {
      await expect(client.getPatientById('')).rejects.toThrow(
        FHIRValidationError
      );
      await expect(client.getPatientById('   ')).rejects.toThrow(
        FHIRValidationError
      );
      await expect(client.getPatientById(null as any)).rejects.toThrow(
        FHIRValidationError
      );
    });

    it('should validate search parameters for getPatients', async () => {
      await expect(
        client.getPatients({
          _count: -1,
        })
      ).rejects.toThrow(FHIRValidationError);

      await expect(
        client.getPatients({
          gender: 'invalid' as any,
        })
      ).rejects.toThrow(FHIRValidationError);

      await expect(
        client.getPatients({
          _count: 2000,
        })
      ).rejects.toThrow(FHIRValidationError);
    });
  });

  describe('Query Builder Integration', () => {
    it('should return PatientQueryBuilder from patients() method', () => {
      const client = new FHIRClient(validConfig);
      const queryBuilder = client.patients();
      
      expect(queryBuilder).toBeDefined();
      expect(queryBuilder.constructor.name).toBe('PatientQueryBuilder');
    });

    it('should allow fluent query building', () => {
      const client = new FHIRClient(validConfig);
      
      expect(() => {
        client.patients()
          .where('family', 'Smith')
          .where('gender', 'male')
          .limit(10)
          .sort('birthdate', 'desc');
      }).not.toThrow();
    });
  });

  describe('Configuration Access', () => {
    it('should return read-only configuration', () => {
      const originalConfig: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        timeout: 60000,
      };

      const client = new FHIRClient(originalConfig);
      const config = client.getConfig();

      // Should return the configuration
      expect(config.baseUrl).toBe('https://example.com/fhir');
      expect(config.timeout).toBe(60000);

      // Should be a copy, not the original reference
      expect(config).not.toBe(originalConfig);
    });
  });
});
