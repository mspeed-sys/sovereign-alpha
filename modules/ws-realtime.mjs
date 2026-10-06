/**
 * WebSocket Real-Time Streaming
 * Live MEV opportunities, balance updates, and settlement confirmations
 */

export class WebSocketRealTime {
  constructor() {
    this.clients = new Map();
    this.channels = new Map();
    this.stats = {
      connections: 0,
      messages: 0,
      errors: 0
    };

    // Initialize channels
    this.channels.set('opportunities', {
      name: 'opportunities',
      subscribers: new Set(),
      lastUpdate: null
    });
    this.channels.set('balances', {
      name: 'balances',
      subscribers: new Set(),
      lastUpdate: null
    });
    this.channels.set('settlements', {
      name: 'settlements',
      subscribers: new Set(),
      lastUpdate: null
    });
    this.channels.set('alerts', {
      name: 'alerts',
      subscribers: new Set(),
      lastUpdate: null
    });
    this.channels.set('metrics', {
      name: 'metrics',
      subscribers: new Set(),
      lastUpdate: null
    });
  }

  /**
   * Register client
   */
  registerClient(clientId, socket) {
    this.clients.set(clientId, {
      id: clientId,
      socket,
      subscriptions: new Set(),
      connected: new Date(),
      messageCount: 0
    });

    this.stats.connections++;
    console.log(`📱 Client connected: ${clientId} (total: ${this.clients.size})`);

    return {
      clientId,
      channels: Array.from(this.channels.keys()),
      message: 'Connected to Sovereign Alpha WebSocket'
    };
  }

  /**
   * Unregister client
   */
  unregisterClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Unsubscribe from all channels
    for (const channelName of client.subscriptions) {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.subscribers.delete(clientId);
      }
    }

    this.clients.delete(clientId);
    console.log(`📱 Client disconnected: ${clientId} (total: ${this.clients.size})`);
  }

  /**
   * Subscribe client to channel
   */
  subscribeClient(clientId, channelName) {
    const client = this.clients.get(clientId);
    const channel = this.channels.get(channelName);

    if (!client || !channel) {
      return { success: false, error: 'Client or channel not found' };
    }

    client.subscriptions.add(channelName);
    channel.subscribers.add(clientId);

    return {
      success: true,
      clientId,
      channel: channelName,
      message: `Subscribed to ${channelName}`
    };
  }

  /**
   * Unsubscribe client from channel
   */
  unsubscribeClient(clientId, channelName) {
    const client = this.clients.get(clientId);
    const channel = this.channels.get(channelName);

    if (!client || !channel) {
      return { success: false, error: 'Client or channel not found' };
    }

    client.subscriptions.delete(channelName);
    channel.subscribers.delete(clientId);

    return {
      success: true,
      clientId,
      channel: channelName,
      message: `Unsubscribed from ${channelName}`
    };
  }

  /**
   * Broadcast message to channel subscribers
   */
  broadcastToChannel(channelName, data) {
    const channel = this.channels.get(channelName);
    if (!channel || channel.subscribers.size === 0) {
      return { success: false, sent: 0 };
    }

    const message = {
      type: channelName,
      data,
      timestamp: Date.now()
    };

    let sent = 0;
    for (const clientId of channel.subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.socket) {
        try {
          // In real implementation: client.socket.send(JSON.stringify(message));
          client.messageCount++;
          sent++;
        } catch (e) {
          console.error(`Failed to send to ${clientId}:`, e.message);
        }
      }
    }

    this.stats.messages += sent;
    channel.lastUpdate = Date.now();

    return { success: true, sent, channel: channelName };
  }

  /**
   * Broadcast MEV opportunity
   */
  broadcastOpportunity(opportunity) {
    return this.broadcastToChannel('opportunities', {
      type: opportunity.type,
      profit: opportunity.estimatedProfit.toFixed(4),
      profitUsd: (opportunity.estimatedProfit * 2000).toFixed(2),
      confidence: (opportunity.confidence * 100).toFixed(1) + '%',
      txHash: opportunity.txHash
    });
  }

  /**
   * Broadcast balance update
   */
  broadcastBalance(vaultName, balances) {
    return this.broadcastToChannel('balances', {
      vault: vaultName,
      ethereum: parseFloat(balances.ethereum).toFixed(4),
      solana: parseFloat(balances.solana).toFixed(4),
      bitcoin: parseFloat(balances.bitcoin).toFixed(8),
      monero: parseFloat(balances.monero).toFixed(12),
      totalUsd: balances.totalValue.toFixed(2)
    });
  }

  /**
   * Broadcast settlement confirmation
   */
  broadcastSettlement(settlement) {
    return this.broadcastToChannel('settlements', {
      txHash: settlement.txHash,
      chain: settlement.chain,
      status: settlement.status,
      confirmations: settlement.confirmations || 0,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast alert
   */
  broadcastAlert(alert) {
    return this.broadcastToChannel('alerts', {
      severity: alert.severity,
      message: alert.message,
      vault: alert.vault,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast metrics
   */
  broadcastMetrics(metrics) {
    return this.broadcastToChannel('metrics', {
      uptime: metrics.uptime,
      memoryMb: metrics.memory.heapUsed,
      opportunities: metrics.metrics.opportunitiesDetected,
      sweeps: metrics.metrics.sweepsExecuted,
      profit: metrics.metrics.totalValue.toFixed(4),
      connections: this.clients.size
    });
  }

  /**
   * Get channel status
   */
  getChannelStatus(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      return { error: 'Channel not found' };
    }

    return {
      name: channelName,
      subscribers: channel.subscribers.size,
      lastUpdate: channel.lastUpdate,
      active: channel.subscribers.size > 0
    };
  }

  /**
   * Get all channels status
   */
  getAllChannelsStatus() {
    const status = {};
    for (const [name, channel] of this.channels) {
      status[name] = {
        subscribers: channel.subscribers.size,
        lastUpdate: channel.lastUpdate,
        active: channel.subscribers.size > 0
      };
    }
    return status;
  }

  /**
   * Get client info
   */
  getClientInfo(clientId) {
    const client = this.clients.get(clientId);
    if (!client) {
      return { error: 'Client not found' };
    }

    return {
      clientId,
      subscriptions: Array.from(client.subscriptions),
      connected: client.connected,
      messagesSent: client.messageCount,
      uptime: Date.now() - client.connected.getTime()
    };
  }

  /**
   * Get all clients
   */
  getAllClients() {
    const clients = [];
    for (const client of this.clients.values()) {
      clients.push({
        clientId: client.id,
        subscriptions: Array.from(client.subscriptions),
        connected: client.connected,
        messagesSent: client.messageCount
      });
    }
    return clients;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      connections: this.stats.connections,
      activeClients: this.clients.size,
      totalMessages: this.stats.messages,
      errors: this.stats.errors,
      channels: Array.from(this.channels.entries()).reduce((acc, [name, ch]) => {
        acc[name] = {
          subscribers: ch.subscribers.size,
          lastUpdate: ch.lastUpdate
        };
        return acc;
      }, {})
    };
  }

  /**
   * Cleanup old connections
   */
  cleanup() {
    let removed = 0;

    for (const [clientId, client] of this.clients) {
      // Remove clients inactive for more than 1 hour
      const age = Date.now() - client.connected.getTime();
      if (age > 60 * 60 * 1000 && client.messageCount === 0) {
        this.unregisterClient(clientId);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Removed ${removed} inactive WebSocket clients`);
    }

    return { removed };
  }
}

export default WebSocketRealTime;
