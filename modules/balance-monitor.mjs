/**
 * Balance Monitor - Real-time Multi-Chain Balance Tracking
 * Monitors vault balances across ETH, Solana, Bitcoin, and Monero
 */

export class BalanceMonitor {
  constructor(blockchainConnector) {
    this.blockchain = blockchainConnector;
    this.vaults = new Map();
    this.balances = new Map();
    this.history = [];
    this.config = {
      updateInterval: 15000, // 15 seconds
      historyLimit: 1000,
      alertThreshold: 0.01 // 0.01 ETH change = alert
    };
    this.monitoring = false;
  }

  /**
   * Register a vault to monitor
   */
  registerVault(vaultName, addresses) {
    this.vaults.set(vaultName, {
      name: vaultName,
      addresses: addresses,
      totalBalance: 0,
      lastUpdate: null,
      alertsTriggered: 0
    });

    console.log(`✅ Vault registered: ${vaultName}`);
  }

  /**
   * Start monitoring all vaults
   */
  async startMonitoring(interval = this.config.updateInterval) {
    if (this.monitoring) return;

    this.monitoring = true;
    console.log('📊 Balance Monitor: Starting continuous monitoring...');

    setInterval(async () => {
      try {
        await this.updateAllBalances();
      } catch (e) {
        console.error('❌ Monitor error:', e.message);
      }
    }, interval);

    // Initial update
    await this.updateAllBalances();
  }

  /**
   * Update all vault balances
   */
  async updateAllBalances() {
    const updateTasks = [];

    for (const [vaultName, vault] of this.vaults) {
      updateTasks.push(
        this.updateVaultBalance(vaultName, vault)
          .catch(e => console.error(`Error updating ${vaultName}:`, e.message))
      );
    }

    await Promise.all(updateTasks);
  }

  /**
   * Update single vault balance
   */
  async updateVaultBalance(vaultName, vault) {
    const balances = {
      ethereum: 0,
      solana: 0,
      bitcoin: 0,
      monero: 0,
      totalValue: 0
    };

    // Update Ethereum
    if (vault.addresses.ethereum && this.blockchain.state.connected.eth) {
      const ethBal = await this.blockchain.getEthereumBalance(vault.addresses.ethereum);
      balances.ethereum = parseFloat(ethBal.eth);
    }

    // Update Solana
    if (vault.addresses.solana && this.blockchain.state.connected.solana) {
      const solBal = await this.blockchain.getSolanaBalance(vault.addresses.solana);
      balances.solana = parseFloat(solBal.sol);
    }

    // Update Bitcoin
    if (vault.addresses.bitcoin && this.blockchain.state.connected.bitcoin) {
      const btcBal = await this.blockchain.getBitcoinBalance(vault.addresses.bitcoin);
      balances.bitcoin = parseFloat(btcBal.btc);
    }

    // Update Monero
    if (vault.addresses.monero && this.blockchain.state.connected.monero) {
      const xmrBal = await this.blockchain.getMoneroBalance(vault.addresses.monero);
      balances.monero = parseFloat(xmrBal.xmr);
    }

    // Calculate total value in USD equivalent
    balances.totalValue =
      (balances.ethereum * 2000) +      // $2000 per ETH
      (balances.solana * 25) +          // $25 per SOL
      (balances.bitcoin * 28000) +      // $28k per BTC
      (balances.monero * 150);          // $150 per XMR

    // Check for significant changes
    const previousBalance = this.balances.get(vaultName);
    if (previousBalance) {
      const ethChange = Math.abs(balances.ethereum - previousBalance.ethereum);
      if (ethChange > this.config.alertThreshold) {
        this.triggerAlert(vaultName, 'ethereum', ethChange, balances);
      }
    }

    // Update vault state
    const vault_data = this.vaults.get(vaultName);
    vault_data.totalBalance = balances.totalValue;
    vault_data.lastUpdate = Date.now();

    // Store balances
    this.balances.set(vaultName, balances);

    // Add to history
    this.history.push({
      vault: vaultName,
      timestamp: Date.now(),
      balances
    });

    // Limit history size
    if (this.history.length > this.config.historyLimit) {
      this.history.shift();
    }

    return balances;
  }

  /**
   * Trigger alert for significant change
   */
  triggerAlert(vaultName, chain, change, balances) {
    const alert = {
      vault: vaultName,
      chain,
      change: change.toFixed(4),
      newBalance: balances[chain].toFixed(4),
      timestamp: Date.now(),
      severity: change > 0.5 ? 'critical' : change > 0.1 ? 'high' : 'medium'
    };

    console.log(`🚨 Balance Alert: ${vaultName} ${chain} changed by ${change.toFixed(4)}`);

    const vault_data = this.vaults.get(vaultName);
    if (vault_data) {
      vault_data.alertsTriggered++;
    }

    return alert;
  }

  /**
   * Get current balances for vault
   */
  getVaultBalance(vaultName) {
    const balances = this.balances.get(vaultName);
    const vault = this.vaults.get(vaultName);

    if (!balances) {
      return { error: 'Vault not found or not yet monitored' };
    }

    return {
      vault: vaultName,
      ethereum: {
        balance: balances.ethereum.toFixed(4),
        address: vault?.addresses?.ethereum || 'unknown',
        usdValue: (balances.ethereum * 2000).toFixed(2)
      },
      solana: {
        balance: balances.solana.toFixed(4),
        address: vault?.addresses?.solana || 'unknown',
        usdValue: (balances.solana * 25).toFixed(2)
      },
      bitcoin: {
        balance: balances.bitcoin.toFixed(8),
        address: vault?.addresses?.bitcoin || 'unknown',
        usdValue: (balances.bitcoin * 28000).toFixed(2)
      },
      monero: {
        balance: balances.monero.toFixed(12),
        address: vault?.addresses?.monero || 'unknown',
        usdValue: (balances.monero * 150).toFixed(2)
      },
      total: {
        usdValue: balances.totalValue.toFixed(2),
        lastUpdate: vault?.lastUpdate || null
      }
    };
  }

  /**
   * Get all vault balances
   */
  getAllBalances() {
    const result = {};

    for (const vaultName of this.vaults.keys()) {
      result[vaultName] = this.getVaultBalance(vaultName);
    }

    return result;
  }

  /**
   * Get balance history for vault
   */
  getBalanceHistory(vaultName, limit = 100) {
    return this.history
      .filter(h => h.vault === vaultName)
      .slice(-limit)
      .map(h => ({
        timestamp: h.timestamp,
        ethereum: h.balances.ethereum.toFixed(4),
        solana: h.balances.solana.toFixed(4),
        bitcoin: h.balances.bitcoin.toFixed(8),
        monero: h.balances.monero.toFixed(12),
        totalUsd: h.balances.totalValue.toFixed(2)
      }));
  }

  /**
   * Get balance changes since last check
   */
  getBalanceChanges() {
    const changes = {};

    for (const [vaultName, current] of this.balances) {
      if (!this.balances.has(vaultName)) continue;

      // Get previous balance from history
      const history = this.history
        .filter(h => h.vault === vaultName)
        .slice(-2);

      if (history.length < 2) continue;

      const previous = history[0].balances;
      const changes_data = {
        vault: vaultName,
        ethereum: {
          change: (current.ethereum - previous.ethereum).toFixed(4),
          percent: ((current.ethereum - previous.ethereum) / previous.ethereum * 100).toFixed(2) + '%'
        },
        solana: {
          change: (current.solana - previous.solana).toFixed(4),
          percent: ((current.solana - previous.solana) / previous.solana * 100).toFixed(2) + '%'
        },
        bitcoin: {
          change: (current.bitcoin - previous.bitcoin).toFixed(8),
          percent: ((current.bitcoin - previous.bitcoin) / previous.bitcoin * 100).toFixed(2) + '%'
        },
        totalChange: ((current.totalValue - previous.totalValue) / previous.totalValue * 100).toFixed(2) + '%'
      };

      changes[vaultName] = changes_data;
    }

    return changes;
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    const totalVaults = this.vaults.size;
    const connectedChains = [
      this.blockchain.state.connected.eth,
      this.blockchain.state.connected.solana,
      this.blockchain.state.connected.bitcoin,
      this.blockchain.state.connected.monero
    ].filter(Boolean).length;

    let totalUsdValue = 0;
    for (const bal of this.balances.values()) {
      totalUsdValue += bal.totalValue;
    }

    return {
      monitoring: this.monitoring,
      totalVaults,
      connectedChains,
      chainsAvailable: 4,
      totalPortfolioValue: totalUsdValue.toFixed(2),
      historySize: this.history.length,
      lastUpdate: Math.max(...Array.from(this.vaults.values()).map(v => v.lastUpdate || 0))
    };
  }
}

export default BalanceMonitor;
