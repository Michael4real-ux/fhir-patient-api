/**
 * Authentication Manager
 */

import { AuthConfig, BearerTokenConfig, JWTConfig } from '../types';
import { JWTManager } from './jwt-manager';
import { AuthenticationError } from '../errors';

export class AuthManager {
  private config: AuthConfig;
  private jwtManager?: JWTManager;

  constructor(config: AuthConfig) {
    this.config = config;

    if (config.type === 'jwt') {
      this.jwtManager = new JWTManager(config as JWTConfig);
    }
  }

  /**
   * Get authentication headers for HTTP requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    switch (this.config.type) {
      case 'jwt': {
        if (!this.jwtManager) {
          throw new AuthenticationError('JWT manager not initialized');
        }
        const jwtToken = await this.jwtManager.getToken();
        headers['Authorization'] = `Bearer ${jwtToken}`;
        break;
      }

      case 'bearer': {
        const bearerConfig = this.config as BearerTokenConfig;
        headers['Authorization'] = `Bearer ${bearerConfig.token}`;
        break;
      }

      case 'none':
        // No authentication headers needed
        break;

      default:
        throw new AuthenticationError(
          'Unsupported authentication type',
          undefined,
          `Unknown auth type: ${(this.config as Record<string, unknown>)['type']}`
        );
    }

    return headers;
  }

  /**
   * Refresh authentication (mainly for JWT tokens)
   */
  async refreshAuth(): Promise<void> {
    if (this.config.type === 'jwt' && this.jwtManager) {
      this.jwtManager.clearCache();
    }
  }

  /**
   * Validate authentication configuration
   */
  static validateConfig(config: AuthConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    switch (config.type) {
      case 'jwt': {
        const jwtConfig = config as JWTConfig;
        if (!jwtConfig.token && !jwtConfig.privateKey) {
          errors.push('JWT authentication requires either token or privateKey');
        }
        if (jwtConfig.privateKey && !jwtConfig.algorithm) {
          errors.push(
            'Algorithm is required when using private key for JWT signing'
          );
        }
        break;
      }

      case 'bearer': {
        const bearerConfig = config as BearerTokenConfig;
        if (!bearerConfig.token) {
          errors.push('Bearer token is required');
        }
        break;
      }

      case 'none':
        // No validation needed
        break;

      default:
        errors.push(
          `Unsupported authentication type: ${(config as Record<string, unknown>)['type']}`
        );
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
