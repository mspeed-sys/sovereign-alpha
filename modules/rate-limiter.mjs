/**
 * Rate Limiter - Request Rate Limiting & Quota Management
 * Controls API access with per-key rate limits and quotas
 */

export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.stats = {
      totalRequests: 0,
      totalLimited: 0,
      totalReset: 0
    };
  }

  /**
   * Check rate limit for key
   */
  checkLimit(keyName, rateLimit = 100, windowSeconds = 60) {
    const now = Date.now();
    const key = `${keyName}_${Math.floor(now / (windowSeconds * 1000))}`;

    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        count: 0,
        created: now,
        window: windowSeconds * 1000,
        limit: rateLimit
      });
    }

    const bucket = this.buckets.get(key);
    this.stats.totalRequests++;

    // Check if bucket has expired
    if (now - bucket.created > bucket.window) {
      bucket.count = 0;
      bucket.created = now;
      this.stats.totalReset++;
    }

    // Check limit
    if (bucket.count >= bucket.limit) {
      this.stats.totalLimited++;
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((bucket.created + bucket.window - now) / 1000),
        limit: bucket.limit
      };
    }

    bucket.count++;

    return {
      allowed: true,
      remaining: bucket.limit - bucket.count,
      limit: bucket.limit,
      resetAt: new Date(bucket.created + bucket.window).toISOString()
    };
  }

  /**
   * Get limit status
   */
  getStatus(keyName, rateLimit = 100, windowSeconds = 60) {
    const now = Date.now();
    const key = `${keyName}_${Math.floor(now / (windowSeconds * 1000))}`;

    if (!this.buckets.has(key)) {
      return {
        keyName,
        used: 0,
        limit: rateLimit,
        remaining: rateLimit,
        resetAt: new Date(now + (windowSeconds * 1000)).toISOString()
      };
    }

    const bucket = this.buckets.get(key);

    return {
      keyName,
      used: bucket.count,
      limit: bucket.limit,
      remaining: Math.max(0, bucket.limit - bucket.count),
      resetAt: new Date(bucket.created + bucket.window).toISOString()
    };
  }

  /**
   * Reset bucket for key
   */
  resetBucket(keyName) {
    const pattern = new RegExp(`^${keyName}_`);
    let removed = 0;

    for (const key of this.buckets.keys()) {
      if (pattern.test(key)) {
        this.buckets.delete(key);
        removed++;
      }
    }

    return { success: true, bucketsRemoved: removed };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalRequests: this.stats.totalRequests,
      totalLimited: this.stats.totalLimited,
      totalReset: this.stats.totalReset,
      activeBuckets: this.buckets.size,
      limitedPercent: this.stats.totalRequests > 0
        ? (this.stats.totalLimited / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Cleanup old buckets
   */
  cleanup(maxAge = 60 * 60 * 1000) {
    const now = Date.now();
    let removed = 0;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.created > maxAge) {
        this.buckets.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Rate limiter cleanup: removed ${removed} old buckets`);
    }

    return { removed };
  }
}

export default RateLimiter;
