/**
 * Database Layer - MongoDB Integration
 * Persistent storage for MEV opportunities, executions, balances, and logs
 */

export class DatabaseLayer {
  constructor(mongoUrl = null) {
    this.mongoUrl = mongoUrl || process.env.MONGO_URL || 'mongodb://localhost:27017/sovereign-alpha';
    this.client = null;
    this.db = null;
    this.collections = {};
    this.connected = false;
    this.state = {
      totalRecords: 0,
      lastWrite: null,
      lastRead: null,
      errors: 0
    };
  }

  /**
   * Initialize database connection (simulated for now)
   */
  async connect() {
    try {
      console.log('🔌 Connecting to MongoDB...');
      console.log(`   URL: ${this.mongoUrl}`);

      // In real implementation:
      // const { MongoClient } = await import('mongodb');
      // this.client = new MongoClient(this.mongoUrl);
      // await this.client.connect();
      // this.db = this.client.db('sovereign-alpha');

      // Simulated connection for now
      this.connected = true;
      console.log('✅ MongoDB connected (simulated)');

      // Initialize collections
      await this.initializeCollections();

      return { connected: true, message: 'Database connected' };
    } catch (e) {
      console.error('❌ Database connection failed:', e.message);
      this.state.errors++;
      return { connected: false, error: e.message };
    }
  }

  /**
   * Initialize all required collections
   */
  async initializeCollections() {
    const collectionNames = [
      'opportunities',
      'executions',
      'balances',
      'settlements',
      'logs',
      'alerts',
      'vaults',
      'transactions'
    ];

    for (const name of collectionNames) {
      this.collections[name] = {
        name,
        count: 0,
        lastWrite: null,
        indexes: []
      };
    }

    console.log(`   ✓ Initialized ${collectionNames.length} collections`);
  }

  /**
   * Store MEV opportunity
   */
  async storeOpportunity(opportunity) {
    try {
      const record = {
        _id: opportunity.txHash,
        ...opportunity,
        storedAt: new Date(),
        status: 'detected'
      };

      // Simulated storage
      if (!this.collections.opportunities.records) {
        this.collections.opportunities.records = [];
      }
      this.collections.opportunities.records.push(record);
      this.collections.opportunities.count++;
      this.state.lastWrite = Date.now();
      this.state.totalRecords++;

      return { success: true, id: opportunity.txHash };
    } catch (e) {
      this.state.errors++;
      console.error('Failed to store opportunity:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Store sweep execution
   */
  async storeExecution(execution) {
    try {
      const record = {
        _id: execution.executionHash,
        ...execution,
        storedAt: new Date(),
        confirmations: 0
      };

      if (!this.collections.executions.records) {
        this.collections.executions.records = [];
      }
      this.collections.executions.records.push(record);
      this.collections.executions.count++;
      this.state.lastWrite = Date.now();
      this.state.totalRecords++;

      return { success: true, id: execution.executionHash };
    } catch (e) {
      this.state.errors++;
      return { success: false, error: e.message };
    }
  }

  /**
   * Store balance snapshot
   */
  async storeBalance(vaultName, balances) {
    try {
      const record = {
        _id: `${vaultName}_${Date.now()}`,
        vault: vaultName,
        ...balances,
        timestamp: new Date()
      };

      if (!this.collections.balances.records) {
        this.collections.balances.records = [];
      }
      this.collections.balances.records.push(record);
      this.collections.balances.count++;
      this.state.lastWrite = Date.now();
      this.state.totalRecords++;

      return { success: true, id: record._id };
    } catch (e) {
      this.state.errors++;
      return { success: false, error: e.message };
    }
  }

  /**
   * Store settlement record
   */
  async storeSettlement(settlement) {
    try {
      const record = {
        _id: settlement.txHash,
        ...settlement,
        storedAt: new Date(),
        status: 'pending'
      };

      if (!this.collections.settlements.records) {
        this.collections.settlements.records = [];
      }
      this.collections.settlements.records.push(record);
      this.collections.settlements.count++;
      this.state.lastWrite = Date.now();
      this.state.totalRecords++;

      return { success: true, id: settlement.txHash };
    } catch (e) {
      this.state.errors++;
      return { success: false, error: e.message };
    }
  }

  /**
   * Store log entry
   */
  async storeLog(logEntry) {
    try {
      const record = {
        _id: `${Date.now()}_${Math.random()}`,
        ...logEntry,
        timestamp: new Date()
      };

      if (!this.collections.logs.records) {
        this.collections.logs.records = [];
      }
      this.collections.logs.records.push(record);
      this.collections.logs.count++;
      this.state.lastWrite = Date.now();
      this.state.totalRecords++;

      // Keep only last 10000 logs
      if (this.collections.logs.records.length > 10000) {
        this.collections.logs.records.shift();
      }

      return { success: true };
    } catch (e) {
      this.state.errors++;
      return { success: false, error: e.message };
    }
  }

  /**
   * Get opportunities within timeframe
   */
  async getOpportunities(hours = 24) {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      const records = this.collections.opportunities.records || [];

      const filtered = records.filter(r =>
        new Date(r.storedAt).getTime() > since
      );

      this.state.lastRead = Date.now();
      return {
        success: true,
        count: filtered.length,
        opportunities: filtered
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get executions within timeframe
   */
  async getExecutions(hours = 24) {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      const records = this.collections.executions.records || [];

      const filtered = records.filter(r =>
        new Date(r.storedAt).getTime() > since
      );

      this.state.lastRead = Date.now();
      return {
        success: true,
        count: filtered.length,
        executions: filtered
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get balance history for vault
   */
  async getBalanceHistory(vaultName, limit = 100) {
    try {
      const records = this.collections.balances.records || [];

      const filtered = records
        .filter(r => r.vault === vaultName)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      this.state.lastRead = Date.now();
      return {
        success: true,
        count: filtered.length,
        history: filtered
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get recent logs
   */
  async getLogs(limit = 100, filter = {}) {
    try {
      let records = this.collections.logs.records || [];

      // Apply filters if any
      if (filter.level) {
        records = records.filter(r => r.level === filter.level);
      }
      if (filter.module) {
        records = records.filter(r => r.module === filter.module);
      }

      const result = records
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      this.state.lastRead = Date.now();
      return {
        success: true,
        count: result.length,
        logs: result
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      connected: this.connected,
      url: this.mongoUrl,
      collections: Object.entries(this.collections).reduce((acc, [name, col]) => {
        acc[name] = {
          count: col.count,
          lastWrite: col.lastWrite
        };
        return acc;
      }, {}),
      totalRecords: this.state.totalRecords,
      lastWrite: this.state.lastWrite,
      lastRead: this.state.lastRead,
      errors: this.state.errors
    };
  }

  /**
   * Get collection info
   */
  getCollectionInfo(collectionName) {
    const col = this.collections[collectionName];
    if (!col) {
      return { error: 'Collection not found' };
    }

    return {
      name: collectionName,
      count: col.count,
      records: col.records?.length || 0,
      lastWrite: col.lastWrite,
      indexes: col.indexes
    };
  }

  /**
   * Cleanup old records (keep only recent)
   */
  async cleanup() {
    try {
      const hoursToKeep = 7 * 24; // 7 days
      const cutoffTime = Date.now() - (hoursToKeep * 60 * 60 * 1000);

      for (const [name, col] of Object.entries(this.collections)) {
        if (!col.records) continue;

        const before = col.records.length;
        col.records = col.records.filter(r =>
          new Date(r.storedAt || r.timestamp).getTime() > cutoffTime
        );
        const after = col.records.length;

        if (before > after) {
          console.log(`🧹 Cleaned ${name}: removed ${before - after} old records`);
          col.count = after;
        }
      }

      return { success: true, message: 'Cleanup complete' };
    } catch (e) {
      console.error('Cleanup failed:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Close database connection
   */
  async disconnect() {
    try {
      // In real implementation: await this.client.close();
      this.connected = false;
      console.log('✅ Database disconnected');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

export default DatabaseLayer;
