/**
 * Tests for asynchronous operations and streaming support
 */

import { PatientQueryBuilder } from './patient-query-builder';
import { FHIRClient } from './fhir-client';
import { Bundle, Patient, PatientSearchParams, FHIRClientConfig } from '../types';
import { FHIRValidationError } from '../errors';

describe('Asynchronous Operations and Streaming', () => {
  let mockExecuteFunction: jest.Mock<Promise<Bundle<Patient>>, [PatientSearchParams]>;
  let queryBuilder: PatientQueryBuilder;
  let client: FHIRClient;
  const baseUrl = 'https://example.com/fhir';

  beforeEach(() => {
    mockExecuteFunction = jest.fn();
    queryBuilder = new PatientQueryBuilder(baseUrl, mockExecuteFunction);
    
    const config: FHIRClientConfig = {
      baseUrl,
      timeout: 5000,
      retryAttempts: 1,
    };
    client = new FHIRClient(config);
  });

  describe('Enhanced streaming with concurrent operations', () => {
    it('should stream results with concurrent page fetching', async () => {
      const mockPatients: Patient[] = Array.from({ length: 150 }, (_, i) => ({
        resourceType: 'Patient',
        id: `patient-${i + 1}`,
        name: [{ family: `Patient${i + 1}` }]
      }));

      // Mock three pages of 50 patients each
      const createMockBundle = (startIndex: number, count: number): Bundle<Patient> => ({
        resourceType: 'Bundle',
        type: 'searchset',
        total: 150,
        entry: mockPatients.slice(startIndex, startIndex + count).map(patient => ({
          resource: patient
        }))
      });

      mockExecuteFunction
        .mockResolvedValueOnce(createMockBundle(0, 50))   // Page 1
        .mockResolvedValueOnce(createMockBundle(50, 50))  // Page 2
        .mockResolvedValueOnce(createMockBundle(100, 50)); // Page 3

      const streamedPatients: Patient[] = [];
      const progressUpdates: Array<{ processed: number; total?: number }> = [];

      for await (const patient of queryBuilder.stream({
        pageSize: 50,
        maxConcurrency: 2,
        onProgress: (processed, total) => {
          progressUpdates.push({ processed, total });
        }
      })) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(150);
      expect(streamedPatients[0].id).toBe('patient-1');
      expect(streamedPatients[149].id).toBe('patient-150');
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].processed).toBe(150);
      expect(mockExecuteFunction).toHaveBeenCalledTimes(4); // May make extra calls due to concurrent buffering
    });

    it('should handle memory limits during streaming', async () => {
      const mockPatients: Patient[] = Array.from({ length: 10 }, (_, i) => ({
        resourceType: 'Patient',
        id: `patient-${i + 1}`,
        name: [{ family: `Patient${i + 1}` }],
        // Add large data to simulate memory usage
        text: { div: 'x'.repeat(1000) } as any
      }));

      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 10,
        entry: mockPatients.map(patient => ({ resource: patient }))
      };

      // Reset the mock for this specific test
      mockExecuteFunction.mockReset();
      mockExecuteFunction.mockResolvedValueOnce(mockBundle);

      const streamedPatients: Patient[] = [];
      
      for await (const patient of queryBuilder.stream({
        pageSize: 10,
        memoryLimit: 1024, // Very small limit to trigger memory management
      })) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(10);
    });

    it('should handle errors in concurrent streaming gracefully', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 50,
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } }
        ]
      };

      mockExecuteFunction
        .mockResolvedValueOnce(mockBundle)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockBundle);

      await expect(async () => {
        const streamedPatients: Patient[] = [];
        for await (const patient of queryBuilder.stream({
          pageSize: 1,
          maxConcurrency: 3
        })) {
          streamedPatients.push(patient);
        }
      }).rejects.toThrow('Network error');
    });

    it('should respect maxConcurrency limits', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 100,
        entry: Array.from({ length: 10 }, (_, i) => ({
          resource: { resourceType: 'Patient', id: `patient-${i + 1}` }
        }))
      };

      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockExecuteFunction.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        
        // Simulate async delay
        await new Promise(resolve => setTimeout(resolve, 10));
        
        concurrentCalls--;
        return mockBundle;
      });

      const streamedPatients: Patient[] = [];
      for await (const patient of queryBuilder.stream({
        pageSize: 10,
        maxConcurrency: 2
      })) {
        streamedPatients.push(patient);
      }

      expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
      expect(streamedPatients.length).toBeGreaterThan(0);
    });
  });

  describe('fetchAll method', () => {
    it('should fetch all results with pagination', async () => {
      const mockPatients: Patient[] = Array.from({ length: 75 }, (_, i) => ({
        resourceType: 'Patient',
        id: `patient-${i + 1}`,
        name: [{ family: `Patient${i + 1}` }]
      }));

      const createMockBundle = (startIndex: number, count: number): Bundle<Patient> => ({
        resourceType: 'Bundle',
        type: 'searchset',
        total: 75,
        entry: mockPatients.slice(startIndex, startIndex + count).map(patient => ({
          resource: patient
        }))
      });

      mockExecuteFunction
        .mockResolvedValueOnce(createMockBundle(0, 50))   // Page 1
        .mockResolvedValueOnce(createMockBundle(50, 25)); // Page 2

      const allPatients = await queryBuilder.fetchAll({
        pageSize: 50,
        maxConcurrency: 2
      });

      expect(allPatients).toHaveLength(75);
      expect(allPatients[0].id).toBe('patient-1');
      expect(allPatients[74].id).toBe('patient-75');
    });

    it('should respect maxResults limit', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1000,
        entry: Array.from({ length: 50 }, (_, i) => ({
          resource: { resourceType: 'Patient', id: `patient-${i + 1}` }
        }))
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      const allPatients = await queryBuilder.fetchAll({
        pageSize: 50,
        maxResults: 100
      });

      expect(allPatients).toHaveLength(100);
    });

    it('should report progress during fetchAll', async () => {
      const createMockBundle = (startIndex: number, count: number): Bundle<Patient> => ({
        resourceType: 'Bundle',
        type: 'searchset',
        total: 20,
        entry: Array.from({ length: count }, (_, i) => ({
          resource: { resourceType: 'Patient', id: `patient-${startIndex + i + 1}` }
        }))
      });

      // Reset the mock for this specific test
      mockExecuteFunction.mockReset();
      mockExecuteFunction
        .mockResolvedValueOnce(createMockBundle(0, 10))   // Page 1
        .mockResolvedValueOnce(createMockBundle(10, 10)); // Page 2

      const progressUpdates: Array<{ processed: number; total?: number }> = [];

      const allPatients = await queryBuilder.fetchAll({
        pageSize: 10,
        onProgress: (processed, total) => {
          progressUpdates.push({ processed, total });
        }
      });

      expect(allPatients).toHaveLength(20);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].processed).toBe(20);
    });
  });

  describe('executeParallel static method', () => {
    it('should execute multiple queries concurrently', async () => {
      const query1 = new PatientQueryBuilder(baseUrl, jest.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: { resourceType: 'Patient', id: 'patient-1' } }]
      }));

      const query2 = new PatientQueryBuilder(baseUrl, jest.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: { resourceType: 'Patient', id: 'patient-2' } }]
      }));

      const query3 = new PatientQueryBuilder(baseUrl, jest.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: { resourceType: 'Patient', id: 'patient-3' } }]
      }));

      const results = await PatientQueryBuilder.executeParallel([query1, query2, query3], {
        maxConcurrency: 2
      });

      expect(results).toHaveLength(3);
      expect(results[0].entry?.[0]?.resource?.id).toBe('patient-1');
      expect(results[1].entry?.[0]?.resource?.id).toBe('patient-2');
      expect(results[2].entry?.[0]?.resource?.id).toBe('patient-3');
    });

    it('should handle errors with failFast=true', async () => {
      const query1 = new PatientQueryBuilder(baseUrl, jest.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: []
      }));

      const query2 = new PatientQueryBuilder(baseUrl, jest.fn().mockRejectedValue(
        new Error('Query failed')
      ));

      await expect(
        PatientQueryBuilder.executeParallel([query1, query2], { failFast: true })
      ).rejects.toThrow('Query failed');
    });

    it('should collect errors with failFast=false', async () => {
      const query1 = new PatientQueryBuilder(baseUrl, jest.fn().mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: { resourceType: 'Patient', id: 'patient-1' } }]
      }));

      const query2 = new PatientQueryBuilder(baseUrl, jest.fn().mockRejectedValue(
        new Error('Query 2 failed')
      ));

      const query3 = new PatientQueryBuilder(baseUrl, jest.fn().mockRejectedValue(
        new Error('Query 3 failed')
      ));

      const results = await PatientQueryBuilder.executeParallel([query1, query2, query3], { failFast: false });

      expect(results).toHaveLength(1); // Only successful queries
    });

    it('should respect maxConcurrency in executeParallel', async () => {
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      const createQuery = () => new PatientQueryBuilder(baseUrl, jest.fn().mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        
        await new Promise(resolve => setTimeout(resolve, 10));
        
        concurrentCalls--;
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: []
        };
      }));

      const queries = Array.from({ length: 10 }, () => createQuery());

      await PatientQueryBuilder.executeParallel(queries, { maxConcurrency: 3 });

      expect(maxConcurrentCalls).toBeLessThanOrEqual(3);
    });
  });

  describe('FHIRClient concurrent operations', () => {
    it('should execute multiple patient queries concurrently', async () => {
      // Mock the HTTP client to simulate successful responses
      const mockGetPatients = jest.spyOn(client, 'getPatients');
      
      mockGetPatients.mockImplementation(async (params) => ({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          { resource: { resourceType: 'Patient', id: `patient-${params?.family || 'default'}` } }
        ]
      }));

      const queries: PatientSearchParams[] = [
        { family: 'Smith' },
        { family: 'Johnson' },
        { family: 'Brown' }
      ];

      const results = await client.getPatientsConcurrent(queries, {
        maxConcurrency: 2
      });

      expect(results).toHaveLength(3);
      expect(mockGetPatients).toHaveBeenCalledTimes(3);
      
      mockGetPatients.mockRestore();
    });

    it('should handle errors in concurrent patient queries', async () => {
      const mockGetPatients = jest.spyOn(client, 'getPatients');
      
      // Test failFast=true (default)
      mockGetPatients
        .mockResolvedValueOnce({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: { resourceType: 'Patient', id: 'patient-1' } }]
        })
        .mockRejectedValueOnce(new Error('Query failed'));

      const queries1: PatientSearchParams[] = [
        { family: 'Smith' },
        { family: 'Johnson' }
      ];

      await expect(
        client.getPatientsConcurrent(queries1)
      ).rejects.toThrow('Query failed');

      // Test failFast=false - should return partial results
      mockGetPatients.mockReset();
      mockGetPatients
        .mockResolvedValueOnce({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: { resourceType: 'Patient', id: 'patient-1' } }]
        })
        .mockRejectedValueOnce(new Error('Query failed'))
        .mockResolvedValueOnce({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: { resourceType: 'Patient', id: 'patient-3' } }]
        });

      const queries2: PatientSearchParams[] = [
        { family: 'Smith' },
        { family: 'Johnson' },
        { family: 'Brown' }
      ];

      const results = await client.getPatientsConcurrent(queries2, {
        failFast: false
      });

      expect(results).toHaveLength(2); // Only successful queries
      
      mockGetPatients.mockRestore();
    });

    it('should fetch multiple patients by ID concurrently', async () => {
      const mockGetPatientById = jest.spyOn(client, 'getPatientById');
      
      mockGetPatientById.mockImplementation(async (id) => ({
        resourceType: 'Patient',
        id,
        name: [{ family: `Patient-${id}` }]
      }));

      const ids = ['patient-1', 'patient-2', 'patient-3'];
      const results = await client.getPatientsByIdConcurrent(ids, {
        maxConcurrency: 2
      });

      expect(results).toHaveLength(3);
      expect(results[0]?.id).toBe('patient-1');
      expect(results[1]?.id).toBe('patient-2');
      expect(results[2]?.id).toBe('patient-3');
      expect(mockGetPatientById).toHaveBeenCalledTimes(3);
      
      mockGetPatientById.mockRestore();
    });

    it('should handle errors in concurrent patient by ID fetching', async () => {
      const mockGetPatientById = jest.spyOn(client, 'getPatientById');
      
      mockGetPatientById
        .mockResolvedValueOnce({ resourceType: 'Patient', id: 'patient-1' })
        .mockRejectedValueOnce(new Error('Patient not found'))
        .mockResolvedValueOnce({ resourceType: 'Patient', id: 'patient-3' });

      const ids = ['patient-1', 'patient-2', 'patient-3'];

      // Test failFast=false - should return partial results
      const results = await client.getPatientsByIdConcurrent(ids, {
        failFast: false
      });

      expect(results).toHaveLength(3);
      expect(results[0]?.id).toBe('patient-1');
      expect(results[1]).toBeNull(); // Failed request
      expect(results[2]?.id).toBe('patient-3');
      
      mockGetPatientById.mockRestore();
    });
  });

  describe('Memory management and performance', () => {
    it('should handle large datasets without memory issues', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        resourceType: 'Patient' as const,
        id: `patient-${i + 1}`,
        name: [{ family: `Patient${i + 1}` }],
        // Simulate larger patient records
        address: Array.from({ length: 3 }, (_, j) => ({
          line: [`Address line ${j + 1} for patient ${i + 1}`],
          city: `City${i + 1}`,
          state: `State${i + 1}`,
          postalCode: `${10000 + i}`
        }))
      }));

      const createMockBundle = (startIndex: number, count: number): Bundle<Patient> => ({
        resourceType: 'Bundle',
        type: 'searchset',
        total: largeDataset.length,
        entry: largeDataset.slice(startIndex, startIndex + count).map(patient => ({
          resource: patient
        }))
      });

      // Mock paginated responses
      let callCount = 0;
      mockExecuteFunction.mockImplementation(async (params) => {
        const offset = params._offset || 0;
        const count = params._count || 50;
        callCount++;
        return createMockBundle(offset, Math.min(count, largeDataset.length - offset));
      });

      const streamedPatients: Patient[] = [];
      
      for await (const patient of queryBuilder.stream({
        pageSize: 100,
        maxConcurrency: 3,
        memoryLimit: 50 * 1024 * 1024 // 50MB limit
      })) {
        streamedPatients.push(patient);
      }

      expect(streamedPatients).toHaveLength(1000);
      expect(callCount).toBeGreaterThan(1); // Should have made multiple paginated calls
    });

    it('should handle concurrent operations under load', async () => {
      const startTime = Date.now();
      
      // Create multiple concurrent streaming operations
      const streamPromises = Array.from({ length: 5 }, async (_, streamIndex) => {
        const createMockBundle = (startIndex: number, count: number): Bundle<Patient> => ({
          resourceType: 'Bundle',
          type: 'searchset',
          total: 20,
          entry: Array.from({ length: count }, (_, i) => ({
            resource: {
              resourceType: 'Patient',
              id: `stream-${streamIndex}-patient-${startIndex + i + 1}`
            }
          }))
        });

        const mockExecute = jest.fn()
          .mockResolvedValueOnce(createMockBundle(0, 10))   // Page 1
          .mockResolvedValueOnce(createMockBundle(10, 10)); // Page 2

        const streamBuilder = new PatientQueryBuilder(baseUrl, mockExecute);

        const results: Patient[] = [];
        for await (const patient of streamBuilder.stream({
          pageSize: 10,
          maxConcurrency: 2
        })) {
          results.push(patient);
        }
        return results;
      });

      const allResults = await Promise.all(streamPromises);
      const endTime = Date.now();

      expect(allResults).toHaveLength(5);
      allResults.forEach((results, index) => {
        expect(results).toHaveLength(20);
        expect(results[0].id).toBe(`stream-${index}-patient-1`);
      });

      // Should complete reasonably quickly with concurrent operations
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Error handling in async operations', () => {
    it('should handle network timeouts gracefully', async () => {
      mockExecuteFunction.mockRejectedValue(new Error('Request timeout'));

      await expect(async () => {
        const results: Patient[] = [];
        for await (const patient of queryBuilder.stream()) {
          results.push(patient);
        }
      }).rejects.toThrow('Request timeout');
    });

    it('should handle partial failures in streaming', async () => {
      const mockBundle1: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 100,
        entry: Array.from({ length: 50 }, (_, i) => ({
          resource: { resourceType: 'Patient', id: `patient-${i + 1}` }
        }))
      };

      mockExecuteFunction
        .mockResolvedValueOnce(mockBundle1)
        .mockRejectedValueOnce(new Error('Network error on page 2'));

      await expect(async () => {
        const results: Patient[] = [];
        for await (const patient of queryBuilder.stream({ pageSize: 50 })) {
          results.push(patient);
        }
      }).rejects.toThrow('Network error on page 2');
    });

    it('should validate streaming options', async () => {
      const mockBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: []
      };

      mockExecuteFunction.mockResolvedValue(mockBundle);

      // Test invalid pageSize
      await expect(async () => {
        const results: Patient[] = [];
        for await (const patient of queryBuilder.stream({ pageSize: 0 })) {
          results.push(patient);
        }
      }).rejects.toThrow();

      // Test invalid maxConcurrency
      await expect(async () => {
        const results: Patient[] = [];
        for await (const patient of queryBuilder.stream({ maxConcurrency: 0 })) {
          results.push(patient);
        }
      }).rejects.toThrow();
    });
  });
});