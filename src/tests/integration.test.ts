/**
 * Integration tests with real FHIR test servers
 */

import { FHIRClient } from '../client';
import { FHIRClientConfig } from '../types';
import {FHIRValidationError } from '../errors';

describe('FHIR Client Integration Tests', () => {
  // Test against public FHIR test servers - configurable via environment variables
  const testServers = [
    {
      name: 'HAPI FHIR R4',
      baseUrl: process.env.FHIR_TEST_SERVER_1 || 'https://hapi.fhir.org/baseR4',
      timeout: parseInt(process.env.FHIR_TEST_TIMEOUT || '5000'),
    },
  ].filter(server => server.baseUrl); // Only include servers that have URLs configured

  testServers.forEach(server => {
    describe(`${server.name} Integration`, () => {
      let client: FHIRClient;

      beforeEach(() => {
        const config: FHIRClientConfig = {
          baseUrl: server.baseUrl,
          timeout: server.timeout,
          retryAttempts: 1,
          retryDelay: 500,
        };
        client = new FHIRClient(config);
      });

      describe('Connection Tests', () => {
        it.skip('should connect to FHIR server', async () => {
          const isConnected = await client.testConnection();
          expect(isConnected).toBe(true);
        }, 8000);
      });

      describe('Patient Search', () => {
        it('should fetch patients with count parameter', async () => {
          const result = await client.getPatients({ _count: 3 });

          expect(result).toBeDefined();
          expect(result.resourceType).toBe('Bundle');
          expect(result.entry).toBeDefined();

          if (result.entry) {
            expect(result.entry.length).toBeLessThanOrEqual(3);
          }
        }, 8000);

        it('should validate search parameters', async () => {
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
        });
      });

      describe('Patient by ID', () => {
        it('should validate patient ID', async () => {
          await expect(client.getPatientById('')).rejects.toThrow(
            FHIRValidationError
          );
          await expect(client.getPatientById('   ')).rejects.toThrow(
            FHIRValidationError
          );
        });
      });

      describe('Authentication', () => {
        it('should work with no authentication', async () => {
          const noAuthClient = new FHIRClient({
            baseUrl: server.baseUrl,
            auth: { type: 'none' },
          });

          const result = await noAuthClient.getPatients({ _count: 1 });
          expect(result).toBeDefined();
          expect(result.resourceType).toBe('Bundle');
        }, 8000);
      });
    });
  });

  describe('Client Configuration', () => {
    it('should handle various configuration options', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        timeout: 60000,
        retryAttempts: 5,
        retryDelay: 2000,
        userAgent: 'MyApp/2.0.0',
        headers: { 'X-Custom': 'test' },
        validateSSL: false,
        auth: { type: 'none' },
      };

      const client = new FHIRClient(config);
      const clientConfig = client.getConfig();

      expect(clientConfig.baseUrl).toBe('https://example.com/fhir');
      expect(clientConfig.timeout).toBe(60000);
      expect(clientConfig.retryAttempts).toBe(5);
      expect(clientConfig.userAgent).toBe('MyApp/2.0.0');
      expect(clientConfig.validateSSL).toBe(false);
    });

    it('should validate configuration properly', () => {
      expect(() => {
        new FHIRClient({
          baseUrl: 'invalid-url',
        });
      }).toThrow();

      expect(() => {
        new FHIRClient({
          baseUrl: 'https://example.com',
          timeout: -1,
        });
      }).toThrow();
    });
  });
});
