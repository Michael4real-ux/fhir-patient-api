/**
 * FHIR Client implementation
 *
 * This file contains the main FHIRClient class with JWT authentication support
 * for secure FHIR server access.
 */

import {
  FHIRClientConfig,
  AuthConfig,
  JWTConfig,
  RequestConfig,
  HttpResponse,
  ValidationResult,
  ValidationError
} from '../types';
import { AuthenticationError, ConfigurationError } from '../errors';

export class FHIRClient {
  private config: Required<FHIRClientConfig>;

  constructor(config: FHIRClientConfig) {
    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new ConfigurationError(
        'Invalid client configuration',
        validation.errors
      );
    }

    // Set default configuration values
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      auth: config.auth || { type: 'none' },
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      userAgent: config.userAgent || 'fhir-patient-api/1.0.0',
      headers: config.headers || {},
      validateSSL: config.validateSSL !== false // Default to true
    };
  }

  /**
   * Validate client configuration
   */
  private validateConfig(config: FHIRClientConfig): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate base URL
    if (!config.baseUrl) {
      errors.push({
        field: 'baseUrl',
        message: 'Base URL is required',
        code: 'required'
      });
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push({
          field: 'baseUrl',
          message: 'Base URL must be a valid URL',
          code: 'invalid-url'
        });
      }
    }

    // Validate timeout
    if (config.timeout !== undefined && (config.timeout <= 0 || config.timeout > 300000)) {
      errors.push({
        field: 'timeout',
        message: 'Timeout must be between 1 and 300000 milliseconds',
        code: 'invalid-range'
      });
    }

    // Validate retry attempts
    if (config.retryAttempts !== undefined && (config.retryAttempts < 0 || config.retryAttempts > 10)) {
      errors.push({
        field: 'retryAttempts',
        message: 'Retry attempts must be between 0 and 10',
        code: 'invalid-range'
      });
    }

    // Validate authentication configuration
    if (config.auth) {
      const authErrors = this.validateAuthConfig(config.auth);
      errors.push(...authErrors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate authentication configuration
   */
  private validateAuthConfig(auth: AuthConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (auth.type) {
      case 'jwt':
        const jwt = auth as JWTConfig;
        if (!jwt.token && !jwt.privateKey) {
          errors.push({
            field: 'auth.token',
            message: 'JWT token or private key is required',
            code: 'required'
          });
        }
        if (jwt.privateKey && !jwt.algorithm) {
          errors.push({
            field: 'auth.algorithm',
            message: 'Algorithm is required when using private key for JWT signing',
            code: 'required'
          });
        }
        break;

      case 'bearer':
        if (!auth.token) {
          errors.push({
            field: 'auth.token',
            message: 'Bearer token is required',
            code: 'required'
          });
        }
        break;

      case 'none':
        // No validation needed for no auth
        break;

      default:
        errors.push({
          field: 'auth.type',
          message: 'Unsupported authentication type. Use "jwt", "bearer", or "none"',
          code: 'invalid-type'
        });
        break;
    }

    return errors;
  }

  /**
   * Get authentication headers for requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    switch (this.config.auth.type) {
      case 'jwt':
        const jwtToken = await this.getJWTToken();
        headers['Authorization'] = `Bearer ${jwtToken}`;
        break;

      case 'bearer':
        headers['Authorization'] = `Bearer ${this.config.auth.token}`;
        break;

      case 'none':
        // No authentication headers needed
        break;
    }

    return headers;
  }



  /**
   * Get JWT token (either provided token or generate new one)
   */
  private async getJWTToken(): Promise<string> {
    const jwtConfig = this.config.auth as JWTConfig;

    // If token is provided directly, use it
    if (jwtConfig.token) {
      return jwtConfig.token;
    }

    // If private key is provided, generate JWT
    if (jwtConfig.privateKey) {
      return this.generateJWT(jwtConfig);
    }

    throw new AuthenticationError(
      'JWT configuration invalid',
      'Either token or privateKey must be provided'
    );
  }

  /**
   * Generate JWT token using private key
   */
  private generateJWT(config: JWTConfig): string {
    // This is a simplified JWT implementation for demonstration
    // In production, use a proper JWT library like 'jsonwebtoken'

    const header = {
      alg: config.algorithm || 'RS256',
      typ: 'JWT',
      ...(config.keyId && { kid: config.keyId })
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...(config.issuer && { iss: config.issuer }),
      ...(config.subject && { sub: config.subject }),
      ...(config.audience && { aud: config.audience }),
      iat: now,
      ...(config.expiresIn && {
        exp: typeof config.expiresIn === 'number'
          ? now + config.expiresIn
          : now + this.parseTimeString(config.expiresIn)
      }),
      ...(config.notBefore && {
        nbf: typeof config.notBefore === 'number'
          ? config.notBefore
          : now + this.parseTimeString(config.notBefore)
      }),
      ...(config.jwtId && { jti: config.jwtId })
    };

    // Base64URL encode header and payload
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    // Create signature (simplified - in production use proper crypto)
    const signature = this.createJWTSignature(
      `${encodedHeader}.${encodedPayload}`,
      config.privateKey!,
      config.algorithm || 'RS256'
    );

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Parse time string to seconds (e.g., "1h" -> 3600)
   */
  private parseTimeString(timeStr: string): number {
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new AuthenticationError('Invalid time format', `Expected format like "1h", "30m", got: ${timeStr}`);
    }

    const value = parseInt(match[1]!);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: throw new AuthenticationError('Invalid time unit', `Supported units: s, m, h, d`);
    }
  }

  /**
   * Base64URL encode (without padding)
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Create JWT signature (simplified implementation)
   * In production, use proper crypto libraries
   */
  private createJWTSignature(data: string, _privateKey: string, algorithm: string): string {
    // This is a mock implementation for testing
    // In production, use Node.js crypto module or a JWT library
    const mockSignature = Buffer.from(`${data}-${algorithm}-signature`)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return mockSignature;
  }

  /**
   * Make HTTP request with authentication and error handling
   */
  public async makeHttpRequest<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    // Get authentication headers
    const authHeaders = await this.getAuthHeaders();

    // Prepare request headers
    const headers = {
      'User-Agent': this.config.userAgent,
      'Accept': 'application/fhir+json',
      'Content-Type': 'application/fhir+json',
      ...this.config.headers,
      ...config.headers,
      ...authHeaders
    };

    // Simulate HTTP request (in real implementation, use fetch or axios)
    return this.simulateHttpRequest<T>({
      ...config,
      url: config.url,
      headers
    });
  }



  /**
   * Simulate HTTP request for testing purposes
   * In a real implementation, this would use fetch() or a library like axios
   */
  private async simulateHttpRequest<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    // This is a mock implementation for testing
    // In production, replace with actual HTTP client

    return new Promise((resolve) => {
      setTimeout(() => {
        // For OAuth2 token requests, simulate token response
        if (config.url.includes('/token') && config.method === 'POST') {
          resolve({
            data: {
              access_token: 'mock-access-token',
              token_type: 'Bearer',
              expires_in: 3600
            } as T,
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/json'
            }
          });
        } else {
          // Simulate successful FHIR response
          resolve({
            data: {} as T,
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/fhir+json'
            }
          });
        }
      }, 100);
    });
  }

  /**
   * Get client configuration (read-only)
   */
  public getConfig(): Readonly<FHIRClientConfig> {
    return { ...this.config };
  }

  /**
   * Test connection to FHIR server
   */
  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeHttpRequest({
        method: 'GET',
        url: `${this.config.baseUrl}/metadata`
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}
