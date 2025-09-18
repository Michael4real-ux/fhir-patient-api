/**
 * Connection Pool implementation with HTTP/2 support
 */

import * as http from 'http';
import * as https from 'https';
import * as http2 from 'http2';
import { URL } from 'url';

export interface ConnectionPoolOptions {
  maxConnections: number;
  maxConnectionsPerHost: number;
  connectionTimeout: number;
  idleTimeout: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  enableHttp2: boolean;
  validateSSL: boolean;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  http1Connections: number;
  http2Connections: number;
  connectionsByHost: Record<string, number>;
  requestsServed: number;
  averageResponseTime: number;
}

interface PooledConnection {
  agent: http.Agent | https.Agent;
  http2Session?: http2.ClientHttp2Session;
  host: string;
  protocol: string;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
  isHttp2: boolean;
}

export class ConnectionPool {
  private options: ConnectionPoolOptions;
  private connections = new Map<string, PooledConnection>();
  private http2Sessions = new Map<string, http2.ClientHttp2Session>();
  private stats: ConnectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    http1Connections: 0,
    http2Connections: 0,
    connectionsByHost: {},
    requestsServed: 0,
    averageResponseTime: 0,
  };
  private responseTimes: number[] = [];
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: Partial<ConnectionPoolOptions> = {}) {
    this.options = {
      maxConnections: 100,
      maxConnectionsPerHost: 10,
      connectionTimeout: 30000,
      idleTimeout: 60000,
      keepAlive: true,
      keepAliveMsecs: 1000,
      enableHttp2: true,
      validateSSL: true,
      ...options,
    };

    this.startCleanupTimer();
  }

  /**
   * Get or create connection for URL
   */
  async getConnection(url: string): Promise<{
    agent?: http.Agent | https.Agent;
    http2Session?: http2.ClientHttp2Session;
    isHttp2: boolean;
  }> {
    const parsedUrl = new URL(url);
    const hostKey = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Try to get existing connection
    let connection = this.connections.get(hostKey);

    if (connection && this.isConnectionValid(connection)) {
      connection.lastUsed = Date.now();
      connection.requestCount++;
      return {
        agent: connection.agent,
        http2Session: connection.http2Session,
        isHttp2: connection.isHttp2,
      };
    }

    // Create new connection
    connection = await this.createConnection(parsedUrl, hostKey);
    this.connections.set(hostKey, connection);

    return {
      agent: connection.agent,
      http2Session: connection.http2Session,
      isHttp2: connection.isHttp2,
    };
  }

  /**
   * Record request completion for stats
   */
  recordRequest(responseTime: number): void {
    this.stats.requestsServed++;
    this.responseTimes.push(responseTime);

    // Keep only last 1000 response times for average calculation
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    this.stats.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) /
      this.responseTimes.length;
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Close all connections and cleanup
   */
  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Close all HTTP/2 sessions
    for (const session of Array.from(this.http2Sessions.values())) {
      if (!session.destroyed) {
        session.close();
      }
    }

    // Destroy all HTTP/1.1 agents
    for (const connection of Array.from(this.connections.values())) {
      if (connection.agent && 'destroy' in connection.agent) {
        connection.agent.destroy();
      }
    }

    this.connections.clear();
    this.http2Sessions.clear();
  }

  /**
   * Create new connection
   */
  private async createConnection(
    parsedUrl: URL,
    hostKey: string
  ): Promise<PooledConnection> {
    const isHttps = parsedUrl.protocol === 'https:';
    const host = parsedUrl.hostname;
    const port = parsedUrl.port || (isHttps ? '443' : '80');

    // Try HTTP/2 first if enabled and HTTPS
    if (this.options.enableHttp2 && isHttps) {
      try {
        const http2Session = await this.createHttp2Session(
          host,
          parseInt(port)
        );
        const connection: PooledConnection = {
          agent: this.createHttpAgent(isHttps), // Fallback agent
          http2Session,
          host: hostKey,
          protocol: parsedUrl.protocol,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          requestCount: 0,
          isHttp2: true,
        };

        this.stats.totalConnections++;
        this.stats.http2Connections++;
        this.updateHostStats(hostKey, 1);

        return connection;
      } catch (error) {
        console.debug(
          `HTTP/2 connection failed for ${hostKey}, falling back to HTTP/1.1:`,
          error
        );
      }
    }

    // Create HTTP/1.1 connection
    const agent = this.createHttpAgent(isHttps);
    const connection: PooledConnection = {
      agent,
      host: hostKey,
      protocol: parsedUrl.protocol,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      requestCount: 0,
      isHttp2: false,
    };

    this.stats.totalConnections++;
    this.stats.http1Connections++;
    this.updateHostStats(hostKey, 1);

    return connection;
  }

  /**
   * Create HTTP/2 session
   */
  private createHttp2Session(
    host: string,
    port: number
  ): Promise<http2.ClientHttp2Session> {
    return new Promise((resolve, reject) => {
      const sessionOptions: http2.ClientSessionOptions = {};

      const session = http2.connect(`https://${host}:${port}`, sessionOptions);

      const timeoutId = setTimeout(() => {
        session.destroy();
        reject(new Error('HTTP/2 connection timeout'));
      }, this.options.connectionTimeout);

      session.on('connect', () => {
        clearTimeout(timeoutId);
        resolve(session);
      });

      session.on('error', error => {
        clearTimeout(timeoutId);
        reject(error);
      });

      session.on('close', () => {
        this.stats.http2Connections = Math.max(
          0,
          this.stats.http2Connections - 1
        );
      });
    });
  }

  /**
   * Create HTTP/1.1 agent
   */
  private createHttpAgent(isHttps: boolean): http.Agent | https.Agent {
    const agentOptions = {
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveMsecs,
      timeout: this.options.connectionTimeout,
      maxSockets: this.options.maxConnectionsPerHost,
      maxFreeSockets: Math.floor(this.options.maxConnectionsPerHost / 2),
    };

    if (isHttps) {
      return new https.Agent({
        ...agentOptions,
        rejectUnauthorized: this.options.validateSSL,
      });
    } else {
      return new http.Agent(agentOptions);
    }
  }

  /**
   * Check if connection is still valid
   */
  private isConnectionValid(connection: PooledConnection): boolean {
    const now = Date.now();
    const age = now - connection.lastUsed;

    // Check if connection is too old
    if (age > this.options.idleTimeout) {
      return false;
    }

    // Check HTTP/2 session
    if (connection.isHttp2 && connection.http2Session) {
      return (
        !connection.http2Session.destroyed && !connection.http2Session.closed
      );
    }

    // HTTP/1.1 connections are considered valid if not too old
    return true;
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    let activeConnections = 0;
    let idleConnections = 0;
    const connectionsByHost: Record<string, number> = {};

    for (const connection of Array.from(this.connections.values())) {
      if (this.isConnectionValid(connection)) {
        const age = Date.now() - connection.lastUsed;
        if (age < 5000) {
          // Active if used in last 5 seconds
          activeConnections++;
        } else {
          idleConnections++;
        }

        connectionsByHost[connection.host] =
          (connectionsByHost[connection.host] || 0) + 1;
      }
    }

    this.stats.activeConnections = activeConnections;
    this.stats.idleConnections = idleConnections;
    this.stats.connectionsByHost = connectionsByHost;
  }

  /**
   * Update host-specific statistics
   */
  private updateHostStats(host: string, delta: number): void {
    this.stats.connectionsByHost[host] =
      (this.stats.connectionsByHost[host] || 0) + delta;
  }

  /**
   * Cleanup expired connections
   */
  private cleanup(): void {
    const expiredConnections: string[] = [];

    for (const [hostKey, connection] of Array.from(
      this.connections.entries()
    )) {
      if (!this.isConnectionValid(connection)) {
        expiredConnections.push(hostKey);

        // Close HTTP/2 session
        if (connection.http2Session && !connection.http2Session.destroyed) {
          connection.http2Session.close();
        }

        // Destroy HTTP/1.1 agent
        if (connection.agent && 'destroy' in connection.agent) {
          connection.agent.destroy();
        }

        this.stats.totalConnections = Math.max(
          0,
          this.stats.totalConnections - 1
        );
        if (connection.isHttp2) {
          this.stats.http2Connections = Math.max(
            0,
            this.stats.http2Connections - 1
          );
        } else {
          this.stats.http1Connections = Math.max(
            0,
            this.stats.http1Connections - 1
          );
        }
        this.updateHostStats(connection.host, -1);
      }
    }

    // Remove expired connections
    for (const hostKey of expiredConnections) {
      this.connections.delete(hostKey);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 30000); // Cleanup every 30 seconds
  }
}
