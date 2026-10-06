/**
 * Authenticator - API Key & JWT Authentication
 * Validates requests and manages API access control
 */

import crypto from 'crypto';

export class Authenticator {
  constructor() {
    this.apiKeys = new Map();
    this.sessions = new Map();
    this.jwtSecret = process.env.JWT_SECRET || 'sovereign-alpha-secret-' + Date.now();

    this.stats = {
      totalAuthenticated: 0,
      totalRejected: 0,
      validSessions: 0
    };

    // Initialize default API keys
    this.initializeDefaultKeys();
  }

  /**
   * Initialize default API keys for development
   */
  initializeDefaultKeys() {
    // Admin key
    this.createApiKey('admin', {
      name: 'Admin Key',
      permissions: ['read', 'write', 'execute', 'admin'],
      rateLimit: 1000,
      created: Date.now()
    });

    // Public read key
    this.createApiKey('public', {
      name: 'Public Read Key',
      permissions: ['read'],
      rateLimit: 100,
      created: Date.now()
    });

    // Developer key
    this.createApiKey('developer', {
      name: 'Developer Key',
      permissions: ['read', 'write'],
      rateLimit: 500,
      created: Date.now()
    });

    console.log('🔐 Authenticator initialized with 3 default API keys');
  }

  /**
   * Create new API key
   */
  createApiKey(name, config) {
    const key = this.generateApiKey();
    const keyData = {
      name: config.name || name,
      key,
      hash: this.hashKey(key),
      permissions: config.permissions || ['read'],
      rateLimit: config.rateLimit || 100,
      created: config.created || Date.now(),
      active: true,
      lastUsed: null,
      requestCount: 0
    };

    this.apiKeys.set(name, keyData);
    return { name, key, ...keyData };
  }

  /**
   * Generate random API key
   */
  generateApiKey() {
    return 'sa_' + crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash API key
   */
  hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Validate API key
   */
  validateApiKey(key) {
    if (!key) {
      return { valid: false, error: 'No API key provided' };
    }

    const keyHash = this.hashKey(key);

    for (const [name, keyData] of this.apiKeys) {
      if (keyData.hash === keyHash) {
        if (!keyData.active) {
          return { valid: false, error: 'API key is inactive' };
        }

        keyData.lastUsed = Date.now();
        keyData.requestCount++;
        this.stats.totalAuthenticated++;

        return {
          valid: true,
          keyName: name,
          permissions: keyData.permissions,
          rateLimit: keyData.rateLimit
        };
      }
    }

    this.stats.totalRejected++;
    return { valid: false, error: 'Invalid API key' };
  }

  /**
   * Generate JWT token
   */
  generateJWT(keyName, permissions) {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const payload = {
      keyName,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      jti: crypto.randomUUID()
    };

    const headerEncoded = this.base64Encode(JSON.stringify(header));
    const payloadEncoded = this.base64Encode(JSON.stringify(payload));

    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(headerEncoded + '.' + payloadEncoded)
      .digest('base64');

    const signatureEncoded = signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const token = headerEncoded + '.' + payloadEncoded + '.' + signatureEncoded;

    this.sessions.set(payload.jti, {
      token,
      keyName,
      permissions,
      created: Date.now(),
      lastUsed: Date.now(),
      valid: true
    });

    this.stats.validSessions++;

    return token;
  }

  /**
   * Verify JWT token
   */
  verifyJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [headerEncoded, payloadEncoded, signatureEncoded] = parts;

      // Verify signature
      const signature = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(headerEncoded + '.' + payloadEncoded)
        .digest('base64');

      const expectedSignature = signature
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      if (signatureEncoded !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Decode payload
      const payload = JSON.parse(this.base64Decode(payloadEncoded));

      // Check expiration
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' };
      }

      // Check session
      const session = this.sessions.get(payload.jti);
      if (!session || !session.valid) {
        return { valid: false, error: 'Session invalid' };
      }

      session.lastUsed = Date.now();

      return {
        valid: true,
        keyName: payload.keyName,
        permissions: payload.permissions,
        jti: payload.jti
      };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  /**
   * Authenticate request
   */
  authenticateRequest(req) {
    // Check for API key in header
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      return this.validateApiKey(apiKey);
    }

    // Check for JWT in Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      return this.verifyJWT(token);
    }

    return { valid: false, error: 'No authentication provided' };
  }

  /**
   * Check permission
   */
  hasPermission(permissions, required) {
    if (!Array.isArray(permissions)) {
      return false;
    }

    if (permissions.includes('admin')) {
      return true;
    }

    if (Array.isArray(required)) {
      return required.some(perm => permissions.includes(perm));
    }

    return permissions.includes(required);
  }

  /**
   * Get API key stats
   */
  getKeyStats(keyName) {
    const key = this.apiKeys.get(keyName);
    if (!key) {
      return { error: 'Key not found' };
    }

    return {
      name: key.name,
      active: key.active,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      created: key.created,
      lastUsed: key.lastUsed,
      requestCount: key.requestCount
    };
  }

  /**
   * Get all API keys (admin only)
   */
  getAllKeys() {
    const keys = [];
    for (const [name, data] of this.apiKeys) {
      keys.push({
        name,
        active: data.active,
        permissions: data.permissions,
        rateLimit: data.rateLimit,
        requestCount: data.requestCount,
        lastUsed: data.lastUsed
      });
    }
    return keys;
  }

  /**
   * Revoke API key
   */
  revokeApiKey(keyName) {
    const key = this.apiKeys.get(keyName);
    if (!key) {
      return { success: false, error: 'Key not found' };
    }

    key.active = false;
    return { success: true, message: `Key ${keyName} revoked` };
  }

  /**
   * Revoke JWT token
   */
  revokeToken(jti) {
    const session = this.sessions.get(jti);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.valid = false;
    this.stats.validSessions--;
    return { success: true, message: 'Token revoked' };
  }

  /**
   * Base64 encode
   */
  base64Encode(str) {
    return Buffer.from(str).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64 decode
   */
  base64Decode(str) {
    const padding = (4 - str.length % 4) % 4;
    const strPadded = str + '='.repeat(padding);
    const strNormal = strPadded
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    return Buffer.from(strNormal, 'base64').toString();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalAuthenticated: this.stats.totalAuthenticated,
      totalRejected: this.stats.totalRejected,
      validSessions: this.stats.validSessions,
      apiKeys: this.apiKeys.size,
      jwtTokens: this.sessions.size
    };
  }
}

export default Authenticator;
