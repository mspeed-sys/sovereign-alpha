/**
 * Body Parser - Request Body Parsing & Validation
 * Handles JSON body parsing with size limits and validation
 */

export class BodyParser {
  constructor(maxSize = 1024 * 1024) { // 1MB default
    this.maxSize = maxSize;
    this.stats = {
      parsed: 0,
      rejected: 0,
      errors: 0
    };
  }

  /**
   * Parse request body
   */
  async parseBody(req, maxSize = this.maxSize) {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', chunk => {
        size += chunk.length;

        // Check size limit
        if (size > maxSize) {
          req.removeAllListeners('data');
          this.stats.rejected++;
          return reject(new Error(`Payload too large (${size} bytes, limit: ${maxSize})`));
        }

        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (!body) {
            resolve({});
          } else {
            const data = JSON.parse(body);
            this.stats.parsed++;
            resolve(data);
          }
        } catch (e) {
          this.stats.errors++;
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });

      req.on('error', (e) => {
        this.stats.errors++;
        reject(e);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (req.readableFlowing) {
          req.removeAllListeners('data');
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Validate body against schema
   */
  validateSchema(data, schema) {
    const errors = [];

    for (const [key, rule] of Object.entries(schema)) {
      const value = data[key];

      // Check required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${key} is required`);
        continue;
      }

      if (value === undefined || value === null) {
        continue;
      }

      // Check type
      if (rule.type && typeof value !== rule.type) {
        errors.push(`${key} must be ${rule.type}, got ${typeof value}`);
      }

      // Check min/max length
      if (rule.minLength && value.length < rule.minLength) {
        errors.push(`${key} must be at least ${rule.minLength} characters`);
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(`${key} must not exceed ${rule.maxLength} characters`);
      }

      // Check pattern
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${key} has invalid format`);
      }

      // Check enum
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
      }

      // Custom validator
      if (rule.validate && !rule.validate(value)) {
        errors.push(`${key} validation failed`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize input
   */
  sanitize(data) {
    if (typeof data !== 'object') {
      return data;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      // Only allow alphanumeric, underscore, and hyphen in keys
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        continue;
      }

      if (typeof value === 'string') {
        // Remove null bytes and control characters
        sanitized[key] = value
          .replace(/\0/g, '')
          .replace(/[\x00-\x1F\x7F]/g, '');
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Parse and validate request
   */
  async parseAndValidate(req, schema = null) {
    try {
      const body = await this.parseBody(req);
      const sanitized = this.sanitize(body);

      if (schema) {
        const validation = this.validateSchema(sanitized, schema);
        if (!validation.valid) {
          return {
            success: false,
            error: 'Validation failed',
            details: validation.errors
          };
        }
      }

      return {
        success: true,
        data: sanitized
      };
    } catch (e) {
      this.stats.errors++;
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Get parser statistics
   */
  getStats() {
    return {
      parsed: this.stats.parsed,
      rejected: this.stats.rejected,
      errors: this.stats.errors,
      maxSize: this.maxSize
    };
  }
}

// Common schemas
export const SCHEMAS = {
  SWEEP_EXECUTE: {
    opportunityId: {
      type: 'string',
      required: true,
      pattern: /^0x[a-fA-F0-9]{64}$/,
      minLength: 66,
      maxLength: 66
    }
  },

  VAULT_REGISTER: {
    name: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_-]+$/
    },
    addresses: {
      type: 'object',
      required: true
    }
  },

  MEV_FILTER: {
    minProfit: {
      type: 'number',
      required: false
    },
    type: {
      type: 'string',
      required: false,
      enum: ['sandwich', 'liquidation', 'arbitrage']
    },
    limit: {
      type: 'number',
      required: false
    }
  }
};

export default BodyParser;
