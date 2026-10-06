/**
 * Logger - Structured Logging System
 * Logs to console and database with levels and modules
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Logger {
  constructor(database = null, logDir = null) {
    this.db = database;
    this.logDir = logDir || path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'sovereign-alpha.log');
    this.errorFile = path.join(this.logDir, 'errors.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB

    this.stats = {
      total: 0,
      byLevel: {
        DEBUG: 0,
        INFO: 0,
        WARN: 0,
        ERROR: 0,
        CRITICAL: 0
      },
      byModule: {}
    };

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get timestamp
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log message
   */
  formatMessage(level, module, message) {
    return `[${this.getTimestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  }

  /**
   * Log message at specific level
   */
  async log(level, module, message, data = null) {
    const timestamp = this.getTimestamp();
    const formatted = this.formatMessage(level, module, message);

    // Update stats
    this.stats.total++;
    this.stats.byLevel[level.toUpperCase()]++;
    if (!this.stats.byModule[module]) {
      this.stats.byModule[module] = 0;
    }
    this.stats.byModule[module]++;

    // Console output
    const emoji = this.getEmoji(level);
    console.log(`${emoji} ${formatted}`);

    // File output
    this.writeToFile(formatted, level === 'ERROR' || level === 'CRITICAL');

    // Database storage
    if (this.db) {
      await this.db.storeLog({
        level: level.toUpperCase(),
        module,
        message,
        data: data || null,
        timestamp
      }).catch(e => console.error('Failed to store log:', e.message));
    }

    return { success: true, timestamp, level, module };
  }

  /**
   * Get emoji for log level
   */
  getEmoji(level) {
    switch (level.toUpperCase()) {
      case 'DEBUG': return '🔍';
      case 'INFO': return 'ℹ️';
      case 'WARN': return '⚠️';
      case 'ERROR': return '❌';
      case 'CRITICAL': return '🚨';
      default: return '📝';
    }
  }

  /**
   * Write to file with rotation
   */
  writeToFile(message, isError = false) {
    try {
      const targetFile = isError ? this.errorFile : this.logFile;
      const entry = message + '\n';

      // Check file size and rotate if needed
      if (fs.existsSync(targetFile)) {
        const stats = fs.statSync(targetFile);
        if (stats.size > this.maxLogSize) {
          this.rotateLog(targetFile);
        }
      }

      fs.appendFileSync(targetFile, entry);
    } catch (e) {
      console.error('Failed to write log:', e.message);
    }
  }

  /**
   * Rotate log file
   */
  rotateLog(filePath) {
    try {
      const timestamp = Date.now();
      const ext = path.extname(filePath);
      const name = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      const backupPath = path.join(dir, `${name}.${timestamp}${ext}`);

      fs.renameSync(filePath, backupPath);
      console.log(`🔄 Log rotated: ${name}`);

      // Clean old backups (keep only 5)
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(name))
        .sort()
        .reverse();

      for (let i = 5; i < files.length; i++) {
        fs.unlinkSync(path.join(dir, files[i]));
      }
    } catch (e) {
      console.error('Failed to rotate log:', e.message);
    }
  }

  /**
   * Debug level
   */
  async debug(module, message, data) {
    return this.log('DEBUG', module, message, data);
  }

  /**
   * Info level
   */
  async info(module, message, data) {
    return this.log('INFO', module, message, data);
  }

  /**
   * Warn level
   */
  async warn(module, message, data) {
    return this.log('WARN', module, message, data);
  }

  /**
   * Error level
   */
  async error(module, message, data) {
    return this.log('ERROR', module, message, data);
  }

  /**
   * Critical level
   */
  async critical(module, message, data) {
    return this.log('CRITICAL', module, message, data);
  }

  /**
   * Log operation with timing
   */
  async logOperation(module, operation, fn) {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      await this.info(module, `✅ ${operation} completed in ${duration}ms`, { duration });
      return result;
    } catch (e) {
      const duration = Date.now() - startTime;
      await this.error(module, `❌ ${operation} failed after ${duration}ms: ${e.message}`, {
        duration,
        error: e.message
      });
      throw e;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      total: this.stats.total,
      byLevel: this.stats.byLevel,
      byModule: this.stats.byModule,
      logFile: this.logFile,
      errorFile: this.errorFile,
      logDir: this.logDir
    };
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 50) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      return lines.slice(-count);
    } catch (e) {
      console.error('Failed to read logs:', e.message);
      return [];
    }
  }

  /**
   * Clear logs
   */
  clearLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
      }
      if (fs.existsSync(this.errorFile)) {
        fs.unlinkSync(this.errorFile);
      }
      console.log('🧹 Logs cleared');
      return { success: true };
    } catch (e) {
      console.error('Failed to clear logs:', e.message);
      return { success: false, error: e.message };
    }
  }
}

export default Logger;
