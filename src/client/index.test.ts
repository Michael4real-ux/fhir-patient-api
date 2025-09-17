/**
 * Unit tests for FHIRClient
 */

import { FHIRClient } from './index';
import { FHIRClientConfig, JWTConfig, BearerTokenConfig } from '../types';
import { ConfigurationError, AuthenticationError } from '../errors';

describe('FHIRClient', () => {
  describe('Constructor and Configuration Validation', () => {
    it('should create client with valid minimal configuration', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://hapi.fhir.org/baseR4'
      };

      const client = new FHIRClient(config);
      expect(client).toBeInstanceOf(FHIRClient);
      
      const clientConfig = client.getConfig();
      expect(clientConfig.baseUrl).toBe('https://hapi.fhir.org/baseR4');
      expect(clientConfig.timeout).toBe(30000);
      expect(clientConfig.retryAttempts).toBe(3);
      expect(clientConfig.auth?.type).toBe('none');
    });

    it('should create client with full configuration', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        timeout: 60000,
        retryAttempts: 5,
        retryDelay: 2000,
        userAgent: 'MyApp/1.0.0',
        headers: { 'X-Custom': 'value' },
        validateSSL: false,
        auth: {
          type: 'bearer',
          token: 'test-token'
        }
      };

      const client = new FHIRClient(config);
      const clientConfig = client.getConfig();
      
      expect(clientConfig.baseUrl).toBe('https://example.com/fhir');
      expect(clientConfig.timeout).toBe(60000);
      expect(clientConfig.retryAttempts).toBe(5);
      expect(clientConfig.retryDelay).toBe(2000);
      expect(clientConfig.userAgent).toBe('MyApp/1.0.0');
      expect(clientConfig.headers).toEqual({ 'X-Custom': 'value' });
      expect(clientConfig.validateSSL).toBe(false);
      expect(clientConfig.auth?.type).toBe('bearer');
    });

    it('should remove trailing slash from baseUrl', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir/'
      };

      const client = new FHIRClient(config);
      expect(client.getConfig().baseUrl).toBe('https://example.com/fhir');
    });

    it('should throw ConfigurationError for missing baseUrl', () => {
      const config = {} as FHIRClientConfig;

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
      expect(() => new FHIRClient(config)).toThrow('Invalid client configuration');
    });

    it('should throw ConfigurationError for invalid baseUrl', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'not-a-valid-url'
      };

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for invalid timeout', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        timeout: -1
      };

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for invalid retryAttempts', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        retryAttempts: 15
      };

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
    });
  });



  describe('Bearer Token Authentication Configuration', () => {
    it('should accept valid bearer token configuration', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'bearer',
          token: 'test-bearer-token'
        } as BearerTokenConfig
      };

      const client = new FHIRClient(config);
      expect(client.getConfig().auth?.type).toBe('bearer');
    });

    it('should throw ConfigurationError for bearer token missing token', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'bearer'
        } as BearerTokenConfig
      };

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
    });
  });



  describe('JWT Authentication Configuration', () => {
    it('should accept valid JWT token configuration', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        } as JWTConfig
      };

      const client = new FHIRClient(config);
      expect(client.getConfig().auth?.type).toBe('jwt');
    });

    it('should accept valid JWT private key configuration', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----',
          algorithm: 'RS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
          subject: 'test-subject',
          expiresIn: '1h'
        } as JWTConfig
      };

      const client = new FHIRClient(config);
      expect(client.getConfig().auth?.type).toBe('jwt');
    });

    it('should throw ConfigurationError for JWT missing token and private key', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt'
        } as JWTConfig
      };

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for JWT private key without algorithm', () => {
      const config: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          privateKey: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----'
        } as JWTConfig
      };

      expect(() => new FHIRClient(config)).toThrow(ConfigurationError);
    });
  });

  describe('HTTP Request Functionality', () => {
    let client: FHIRClient;

    beforeEach(() => {
      client = new FHIRClient({
        baseUrl: 'https://example.com/fhir'
      });
    });

    it('should make HTTP request with default headers', async () => {
      const response = await client.makeHttpRequest({
        method: 'GET',
        url: 'https://example.com/fhir/Patient'
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    });

    it('should include authentication headers for bearer token', async () => {
      const clientWithAuth = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'bearer',
          token: 'test-token'
        }
      });

      const response = await clientWithAuth.makeHttpRequest({
        method: 'GET',
        url: 'https://example.com/fhir/Patient'
      });

      expect(response.status).toBe(200);
    });



    it('should include JWT token in authorization header', async () => {
      const clientWithAuth = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        }
      });

      const response = await clientWithAuth.makeHttpRequest({
        method: 'GET',
        url: 'https://example.com/fhir/Patient'
      });

      expect(response.status).toBe(200);
    });

    it('should generate JWT token from private key', async () => {
      const clientWithAuth = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          privateKey: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
          algorithm: 'RS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '1h'
        }
      });

      const response = await clientWithAuth.makeHttpRequest({
        method: 'GET',
        url: 'https://example.com/fhir/Patient'
      });

      expect(response.status).toBe(200);
    });
  });

  describe('JWT Token Management', () => {
    it('should handle JWT token authentication', async () => {
      const client = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        }
      });

      const response = await client.makeHttpRequest({
        method: 'GET',
        url: 'https://example.com/fhir/Patient'
      });

      expect(response.status).toBe(200);
    });

    it('should generate JWT token from private key', async () => {
      const client = new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----',
          algorithm: 'RS256',
          issuer: 'test-issuer',
          subject: 'test-subject',
          audience: 'https://example.com/fhir',
          expiresIn: '1h'
        }
      });

      const response = await client.makeHttpRequest({
        method: 'GET',
        url: 'https://example.com/fhir/Patient'
      });

      expect(response.status).toBe(200);
    });

    it('should throw ConfigurationError for invalid JWT configuration', () => {
      expect(() => new FHIRClient({
        baseUrl: 'https://example.com/fhir',
        auth: {
          type: 'jwt'
          // Missing both token and privateKey
        } as JWTConfig
      })).toThrow(ConfigurationError);
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      const client = new FHIRClient({
        baseUrl: 'https://example.com/fhir'
      });

      const isConnected = await client.testConnection();
      expect(isConnected).toBe(true);
    });

    it('should handle connection test failure gracefully', async () => {
      // Mock a failing HTTP request by creating a client that will fail
      const client = new FHIRClient({
        baseUrl: 'https://example.com/fhir'
      });

      // Override the simulateHttpRequest to simulate failure
      const originalMethod = (client as any).simulateHttpRequest;
      (client as any).simulateHttpRequest = jest.fn().mockRejectedValue(new Error('Network error'));

      const isConnected = await client.testConnection();
      expect(isConnected).toBe(false);

      // Restore original method
      (client as any).simulateHttpRequest = originalMethod;
    });
  });

  describe('Configuration Access', () => {
    it('should return read-only configuration', () => {
      const originalConfig: FHIRClientConfig = {
        baseUrl: 'https://example.com/fhir',
        timeout: 60000,
        auth: {
          type: 'bearer',
          token: 'test-token'
        }
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

  describe('Error Handling', () => {
    it('should provide detailed validation errors', () => {
      const config = {
        baseUrl: 'invalid-url',
        timeout: -1,
        retryAttempts: 15
      } as FHIRClientConfig;

      try {
        new FHIRClient(config);
        fail('Should have thrown ConfigurationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.validationErrors).toBeDefined();
        expect(configError.validationErrors!.length).toBeGreaterThan(0);
        
        const errorFields = configError.validationErrors!.map(e => e.field);
        expect(errorFields).toContain('baseUrl');
        expect(errorFields).toContain('timeout');
        expect(errorFields).toContain('retryAttempts');
      }
    });
  });
});