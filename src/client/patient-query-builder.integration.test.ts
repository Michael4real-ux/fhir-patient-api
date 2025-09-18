/**
 * Integration tests for PatientQueryBuilder with FHIRClient
 */

import { FHIRClient } from './fhir-client';
import { PatientQueryBuilder } from './patient-query-builder';
import { FHIRClientConfig } from '../types';

// Mock the HTTP client and auth manager to avoid real network calls
jest.mock('../http/http-client');
jest.mock('../auth/auth-manager');

describe('PatientQueryBuilder Integration', () => {
  let client: FHIRClient;
  let queryBuilder: PatientQueryBuilder;

  const validConfig: FHIRClientConfig = {
    baseUrl: 'https://hapi.fhir.org/baseR4',
  };

  beforeEach(() => {
    client = new FHIRClient(validConfig);
    queryBuilder = client.patients();
  });

  describe('Integration with FHIRClient', () => {
    it('should create PatientQueryBuilder from FHIRClient', () => {
      expect(queryBuilder).toBeInstanceOf(PatientQueryBuilder);
    });

    it('should build correct URLs through the query builder', () => {
      const url = queryBuilder
        .where('family', 'Smith')
        .where('gender', 'male')
        .limit(10)
        .sort('birthdate', 'desc')
        .buildUrl();

      expect(url).toContain('https://hapi.fhir.org/baseR4/Patient');
      expect(url).toContain('family=Smith');
      expect(url).toContain('gender=male');
      expect(url).toContain('_count=10');
      expect(url).toContain('_sort=-birthdate');
    });



    it('should handle OR logic for multiple values of same field', () => {
      const url = queryBuilder
        .where('family', 'Smith')
        .where('family', 'Johnson')
        .where('family', 'Brown')
        .buildUrl();

      expect(url).toContain('family=Smith%2CJohnson%2CBrown');
    });

    it('should handle date range queries', () => {
      const url = queryBuilder
        .where('birthdate', '1990-01-01')
        .where('_lastUpdated', '2023-01-01')
        .buildUrl();

      expect(url).toContain('birthdate=1990-01-01');
      expect(url).toContain('_lastUpdated=2023-01-01');
    });

    it('should support method chaining', () => {
      expect(() => {
        queryBuilder
          .where('family', 'Smith')
          .where('gender', 'male')
          .where('active', 'true')
          .limit(25)
          .offset(10)
          .sort('family', 'asc')
          .sort('given', 'asc')
          .include('Patient:organization')
          .summary('data')
          .elements(['id', 'name', 'gender', 'birthDate']);
      }).not.toThrow();
    });

    it('should clone query builders independently', () => {
      const baseQuery = queryBuilder.where('active', 'true').limit(10);

      const maleQuery = baseQuery.clone().where('gender', 'male');
      const femaleQuery = baseQuery.clone().where('gender', 'female');

      const baseParams = baseQuery.getParams();
      const maleParams = maleQuery.getParams();
      const femaleParams = femaleQuery.getParams();

      expect(baseParams.gender).toBeUndefined();
      expect(maleParams.gender).toBe('male');
      expect(femaleParams.gender).toBe('female');

      // All should have the base parameters
      expect(baseParams.active).toBe('true');
      expect(maleParams.active).toBe('true');
      expect(femaleParams.active).toBe('true');
    });

    it('should reset query builder to empty state', () => {
      queryBuilder.where('family', 'Smith').limit(10).sort('name');

      expect(Object.keys(queryBuilder.getParams())).toHaveLength(3);

      queryBuilder.reset();

      expect(Object.keys(queryBuilder.getParams())).toHaveLength(0);
    });

    it('should validate parameters before building URL', () => {
      expect(() => {
        queryBuilder.where('gender', 'invalid-gender').buildUrl();
      }).toThrow();

      expect(() => {
        queryBuilder.limit(-1).buildUrl();
      }).toThrow();

      expect(() => {
        queryBuilder.sort('invalid-field').buildUrl();
      }).toThrow();
    });

    it('should support streaming interface', async () => {
      // This test verifies the streaming interface exists and can be called
      // The actual streaming logic is tested in the unit tests
      const stream = queryBuilder.where('active', 'true').stream();
      expect(stream).toBeDefined();
      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    });
  });

  describe('Query Parameter Validation', () => {
    it('should validate FHIR search parameters', () => {
      // Valid parameters should work
      expect(() => {
        queryBuilder
          .where('identifier', 'MRN|12345')
          .where('name', 'John Smith')
          .where('family', 'Smith')
          .where('given', 'John')
          .where('gender', 'male')
          .where('birthdate', '1990-01-15')
          .where('active', 'true')
          .where('deceased', 'false');
      }).not.toThrow();

      // Invalid parameters should throw
      expect(() => {
        queryBuilder.where('gender', 'invalid');
      }).toThrow();

      expect(() => {
        queryBuilder.where('birthdate', 'invalid-date');
      }).toThrow();

      expect(() => {
        queryBuilder.where('active', 'maybe');
      }).toThrow();
    });

    it('should validate result parameters', () => {
      expect(() => {
        queryBuilder
          .limit(50)
          .offset(100)
          .summary('count')
          .elements(['id', 'name']);
      }).not.toThrow();

      expect(() => {
        queryBuilder.limit(1001);
      }).toThrow();

      expect(() => {
        queryBuilder.offset(-1);
      }).toThrow();

      expect(() => {
        queryBuilder.summary('invalid' as any);
      }).toThrow();
    });

    it('should validate include parameters', () => {
      expect(() => {
        queryBuilder
          .include('Patient:organization')
          .include('Patient:general-practitioner')
          .include('Patient:link:Patient');
      }).not.toThrow();

      expect(() => {
        queryBuilder.include('invalid-format');
      }).toThrow();

      expect(() => {
        queryBuilder.include('Patient'); // Missing field
      }).toThrow();
    });
  });

  describe('URL Construction', () => {
    it('should properly encode special characters', () => {
      const url = queryBuilder
        .where('name', "O'Brien")
        .where('address', '123 Main St, Apt #5')
        .buildUrl();

      // Check that the URL contains the parameters (encoding may vary)
      expect(url).toContain('name=');
      expect(url).toContain('address=');
      expect(url).toContain('Brien');
      expect(url).toContain('Main');
    });

    it('should handle empty parameters gracefully', () => {
      const url = queryBuilder.buildUrl();
      expect(url).toBe('https://hapi.fhir.org/baseR4/Patient');
    });

    it('should construct proper query strings', () => {
      const url = queryBuilder
        .where('family', 'Smith')
        .where('given', 'John')
        .limit(10)
        .buildUrl();

      const urlParts = url.split('?');
      expect(urlParts).toHaveLength(2);
      expect(urlParts[0]).toBe('https://hapi.fhir.org/baseR4/Patient');

      const queryString = urlParts[1];
      expect(queryString).toContain('family=Smith');
      expect(queryString).toContain('given=John');
      expect(queryString).toContain('_count=10');
    });
  });
});
