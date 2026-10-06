/**
 * Blockchain Connector - RPC Connection Manager
 * Manages connections to ETH, Solana, Bitcoin, and Monero
 */

import fetch from 'node-fetch';

export class BlockchainConnector {
  constructor(config = {}) {
    this.config = {
      eth: {
        rpcUrl: config.ethRpc || process.env.ETH_RPC_URL || 'https://eth.rpc.blxrbdn.com',
        chainId: 1,
        name: 'Ethereum'
      },
      solana: {
        rpcUrl: config.solanaRpc || process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
        chainId: 101,
        name: 'Solana'
      },
      bitcoin: {
        rpcUrl: config.bitcoinRpc || process.env.BTC_RPC_URL || 'https://blockstream.info/api',
        chainId: 0,
        name: 'Bitcoin'
      },
      monero: {
        rpcUrl: config.moneroRpc || process.env.XMR_RPC_URL || 'http://localhost:18081',
        chainId: 0,
        name: 'Monero'
      }
    };

    this.state = {
      connected: {
        eth: false,
        solana: false,
        bitcoin: false,
        monero: false
      },
      lastCheck: {},
      blockNumbers: {},
      failures: {}
    };

    this.cache = {
      blocks: {},
      accounts: {},
      ttl: 5 * 60 * 1000 // 5 min cache
    };
  }

  /**
   * Test all RPC connections
   */
  async testConnections() {
    const results = {
      eth: await this.testEthereumRPC(),
      solana: await this.testSolanaRPC(),
      bitcoin: await this.testBitcoinRPC(),
      monero: await this.testMoneroRPC()
    };
    return results;
  }

  /**
   * Test Ethereum RPC Connection
   */
  async testEthereumRPC() {
    try {
      const response = await fetch(this.config.eth.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1
        })
      });
      const data = await response.json();
      this.state.connected.eth = !data.error;
      this.state.lastCheck.eth = Date.now();
      return {
        connected: !data.error,
        chainId: data.result || '0x1',
        network: 'Ethereum',
        rpc: this.config.eth.rpcUrl
      };
    } catch (e) {
      this.state.connected.eth = false;
      this.state.failures.eth = e.message;
      return { connected: false, error: e.message, network: 'Ethereum' };
    }
  }

  /**
   * Test Solana RPC Connection
   */
  async testSolanaRPC() {
    try {
      const response = await fetch(this.config.solana.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getClusterNodes',
          id: 1
        })
      });
      const data = await response.json();
      this.state.connected.solana = !data.error;
      this.state.lastCheck.solana = Date.now();
      return {
        connected: !data.error,
        network: 'Solana',
        nodes: data.result?.length || 0,
        rpc: this.config.solana.rpcUrl
      };
    } catch (e) {
      this.state.connected.solana = false;
      this.state.failures.solana = e.message;
      return { connected: false, error: e.message, network: 'Solana' };
    }
  }

  /**
   * Test Bitcoin RPC Connection
   */
  async testBitcoinRPC() {
    try {
      const response = await fetch(`${this.config.bitcoin.rpcUrl}/blocks/tip/height`);
      const height = await response.text();
      this.state.connected.bitcoin = response.ok;
      this.state.lastCheck.bitcoin = Date.now();
      return {
        connected: response.ok,
        network: 'Bitcoin',
        blockHeight: parseInt(height),
        rpc: this.config.bitcoin.rpcUrl
      };
    } catch (e) {
      this.state.connected.bitcoin = false;
      this.state.failures.bitcoin = e.message;
      return { connected: false, error: e.message, network: 'Bitcoin' };
    }
  }

  /**
   * Test Monero RPC Connection
   */
  async testMoneroRPC() {
    try {
      const response = await fetch(this.config.monero.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '0',
          method: 'get_height'
        })
      });
      const data = await response.json();
      this.state.connected.monero = !data.error;
      this.state.lastCheck.monero = Date.now();
      return {
        connected: !data.error,
        network: 'Monero',
        blockHeight: data.result?.height || 0,
        rpc: this.config.monero.rpcUrl
      };
    } catch (e) {
      this.state.connected.monero = false;
      this.state.failures.monero = e.message;
      return { connected: false, error: e.message, network: 'Monero' };
    }
  }

  /**
   * Get Ethereum Block
   */
  async getEthereumBlock(blockNumber = 'latest') {
    if (this.cache.blocks[`eth_${blockNumber}`]) {
      return this.cache.blocks[`eth_${blockNumber}`];
    }

    try {
      const response = await fetch(this.config.eth.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [blockNumber === 'latest' ? 'latest' : `0x${blockNumber.toString(16)}`, true],
          id: 1
        })
      });
      const data = await response.json();
      if (data.result) {
        this.cache.blocks[`eth_${blockNumber}`] = data.result;
      }
      return data.result;
    } catch (e) {
      console.error('Failed to get Ethereum block:', e.message);
      return null;
    }
  }

  /**
   * Get Ethereum Account Balance
   */
  async getEthereumBalance(address) {
    const cacheKey = `eth_${address}`;
    if (this.cache.accounts[cacheKey]) {
      return this.cache.accounts[cacheKey];
    }

    try {
      const response = await fetch(this.config.eth.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1
        })
      });
      const data = await response.json();
      const balanceWei = data.result ? BigInt(data.result).toString() : '0';
      const balanceEth = (parseInt(balanceWei) / 1e18).toFixed(4);

      this.cache.accounts[cacheKey] = { wei: balanceWei, eth: balanceEth };
      return { wei: balanceWei, eth: balanceEth };
    } catch (e) {
      console.error('Failed to get Ethereum balance:', e.message);
      return { wei: '0', eth: '0' };
    }
  }

  /**
   * Get Solana Account Balance
   */
  async getSolanaBalance(address) {
    const cacheKey = `sol_${address}`;
    if (this.cache.accounts[cacheKey]) {
      return this.cache.accounts[cacheKey];
    }

    try {
      const response = await fetch(this.config.solana.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getBalance',
          params: [address],
          id: 1
        })
      });
      const data = await response.json();
      const balanceLamports = data.result?.value || 0;
      const balanceSol = (balanceLamports / 1e9).toFixed(4);

      this.cache.accounts[cacheKey] = { lamports: balanceLamports, sol: balanceSol };
      return { lamports: balanceLamports, sol: balanceSol };
    } catch (e) {
      console.error('Failed to get Solana balance:', e.message);
      return { lamports: 0, sol: '0' };
    }
  }

  /**
   * Get Bitcoin Balance (from address)
   */
  async getBitcoinBalance(address) {
    const cacheKey = `btc_${address}`;
    if (this.cache.accounts[cacheKey]) {
      return this.cache.accounts[cacheKey];
    }

    try {
      const response = await fetch(`${this.config.bitcoin.rpcUrl}/address/${address}`);
      const data = await response.json();
      const balanceSatoshis = data.chain_stats?.funded_txo_sum || 0;
      const balanceBtc = (balanceSatoshis / 1e8).toFixed(8);

      this.cache.accounts[cacheKey] = { satoshis: balanceSatoshis, btc: balanceBtc };
      return { satoshis: balanceSatoshis, btc: balanceBtc };
    } catch (e) {
      console.error('Failed to get Bitcoin balance:', e.message);
      return { satoshis: 0, btc: '0' };
    }
  }

  /**
   * Get Monero Balance
   */
  async getMoneroBalance(address) {
    const cacheKey = `xmr_${address}`;
    if (this.cache.accounts[cacheKey]) {
      return this.cache.accounts[cacheKey];
    }

    try {
      const response = await fetch(this.config.monero.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '0',
          method: 'get_address_balance'
        })
      });
      const data = await response.json();
      const balanceAtomic = data.result?.balance || 0;
      const balanceXmr = (balanceAtomic / 1e12).toFixed(12);

      this.cache.accounts[cacheKey] = { atomic: balanceAtomic, xmr: balanceXmr };
      return { atomic: balanceAtomic, xmr: balanceXmr };
    } catch (e) {
      console.error('Failed to get Monero balance:', e.message);
      return { atomic: 0, xmr: '0' };
    }
  }

  /**
   * Get Health Status
   */
  getHealth() {
    return {
      ethereum: {
        connected: this.state.connected.eth,
        lastCheck: this.state.lastCheck.eth || null,
        rpc: this.config.eth.rpcUrl
      },
      solana: {
        connected: this.state.connected.solana,
        lastCheck: this.state.lastCheck.solana || null,
        rpc: this.config.solana.rpcUrl
      },
      bitcoin: {
        connected: this.state.connected.bitcoin,
        lastCheck: this.state.lastCheck.bitcoin || null,
        rpc: this.config.bitcoin.rpcUrl
      },
      monero: {
        connected: this.state.connected.monero,
        lastCheck: this.state.lastCheck.monero || null,
        rpc: this.config.monero.rpcUrl
      },
      allConnected: this.state.connected.eth || this.state.connected.solana ||
                    this.state.connected.bitcoin || this.state.connected.monero
    };
  }

  /**
   * Clear cache (for periodic cleanup)
   */
  clearCache() {
    this.cache.blocks = {};
    this.cache.accounts = {};
  }
}

export default BlockchainConnector;
