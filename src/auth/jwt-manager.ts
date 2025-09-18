/**
 * JWT Token Management
 */

import jwt from 'jsonwebtoken';
import { JWTConfig } from '../types';
import { AuthenticationError } from '../errors';

export class JWTManager {
  private config: JWTConfig;
  private cachedToken?: string;
  private tokenExpiry?: number;

  constructor(config: JWTConfig) {
    this.config = config;
  }

  /**
   * Get valid JWT token (cached or newly generated)
   */
  async getToken(): Promise<string> {
    // If we have a pre-provided token, validate it first
    if (this.config.token) {
      if (this.isTokenValid(this.config.token)) {
        return this.config.token;
      } else {
        throw new AuthenticationError(
          'Provided JWT token is invalid or expired',
          undefined,
          'Token validation failed'
        );
      }
    }

    // Check if we have a valid cached token (with 5-minute buffer before expiry)
    const bufferTime = 5 * 60; // 5 minutes in seconds
    if (
      this.cachedToken &&
      this.tokenExpiry &&
      Date.now() < (this.tokenExpiry - bufferTime) * 1000
    ) {
      return this.cachedToken;
    }

    // Generate new token
    if (this.config.privateKey) {
      this.cachedToken = this.generateToken();
      return this.cachedToken;
    }

    throw new AuthenticationError(
      'JWT configuration invalid',
      undefined,
      'Either token or privateKey must be provided'
    );
  }

  /**
   * Validate token structure and expiry
   */
  private isTokenValid(token: string): boolean {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        return false;
      }

      const payload = decoded.payload as jwt.JwtPayload;

      // Check if token is expired (with 1-minute buffer)
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        const buffer = 60; // 1 minute buffer
        return payload.exp > now + buffer;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate JWT token using private key
   */
  private generateToken(): string {
    if (!this.config.privateKey) {
      throw new AuthenticationError(
        'Private key is required for token generation'
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.parseExpiresIn(this.config.expiresIn || '1h');
    const expiry = now + expiresIn;

    const payload: jwt.JwtPayload = {
      iat: now,
      exp: expiry,
    };

    // Add optional claims
    if (this.config.issuer) payload.iss = this.config.issuer;
    if (this.config.subject) payload.sub = this.config.subject;
    if (this.config.audience) payload.aud = this.config.audience;
    if (this.config.jwtId) payload.jti = this.config.jwtId;
    if (this.config.notBefore) {
      payload.nbf =
        typeof this.config.notBefore === 'number'
          ? this.config.notBefore
          : now + this.parseExpiresIn(this.config.notBefore);
    }

    const options: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'RS256',
    };

    if (this.config.keyId) {
      options.keyid = this.config.keyId;
    }

    try {
      const token = jwt.sign(payload, this.config.privateKey!, options);
      this.tokenExpiry = expiry;
      return token;
    } catch (error) {
      throw new AuthenticationError(
        'Failed to generate JWT token',
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Parse time string to seconds (e.g., "1h" -> 3600)
   */
  private parseExpiresIn(timeStr: string | number): number {
    if (typeof timeStr === 'number') {
      return timeStr;
    }

    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new AuthenticationError(
        'Invalid time format',
        undefined,
        `Expected format like "1h", "30m", got: ${timeStr}`
      );
    }

    const value = parseInt(match[1] as string);
    const unit = match[2] as string;

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        throw new AuthenticationError(
          'Invalid time unit',
          undefined,
          `Supported units: s, m, h, d`
        );
    }
  }

  /**
   * Verify if a token is valid (for testing purposes)
   */
  verifyToken(token: string, publicKey?: string): boolean {
    try {
      if (publicKey || this.config.publicKey) {
        jwt.verify(token, publicKey || this.config.publicKey!, {
          algorithms: [this.config.algorithm || 'RS256'],
        });
        return true;
      }
      // If no public key, just decode to check structure
      jwt.decode(token, { complete: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached token (force regeneration on next request)
   */
  clearCache(): void {
    this.cachedToken = undefined;
    this.tokenExpiry = undefined;
  }
}
