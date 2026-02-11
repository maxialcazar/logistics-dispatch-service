import { createRedisClient } from "../redis";
import logger from "../utils/logger";
import EventEmitter from "events";

// ARCHITECTURE NOTE:
// This is a Singleton EventBus designed solely to bridge Redis Pub/Sub events 
// to the application layer. It is NOT a stateful message broker.
// 
// CONSTRAINTS:
// - Do NOT store state here.
// - Usage is strictly strictly for ephemeral "fire-and-forget" events (e.g., location updates).
// - Do NOT use for critical transaction logic (use a proper Queue like BullMQ for that).
class EventBus extends EventEmitter {
  private subscriber: ReturnType<typeof createRedisClient> | null = null;
  private isConnected = false;

  constructor() {
    super();
    // High limit to support many concurrent SSE connections, 
    // but monitor memory usage if this goes above ~50k listeners.
    this.setMaxListeners(10000); 
  }

  async init() {
    if (this.isConnected) return;
    
    if (process.env.REDIS_ENABLED !== 'true') {
        logger.info("📡 EventBus disabled (REDIS_ENABLED!=true)");
        return;
    }

    this.subscriber = createRedisClient();
    
    // Global error handler for redis
    this.subscriber.on('error', (err) => {
        logger.error('EventBus Redis Error', err);
    });

    try {
      await this.subscriber.connect();
      this.isConnected = true;
      logger.info("📡 EventBus connected to Redis Pub/Sub");

      // Subscribe to core channels
      await this.subscriber.subscribe("driver.location.updated", (message) => {
        try {
          const data = JSON.parse(message);
          this.emit("driver.location.updated", data);
        } catch (err) {
          logger.error("EventBus parse error", err);
        }
      });
      
    } catch (err) {
      logger.error("EventBus connection failed", err);
      this.isConnected = false;
    }
  }

  // Wrapper to allow graceful shutdown
  async close() {
      if (this.subscriber) {
          await this.subscriber.quit();
          this.isConnected = false;
      }
  }
}

// Singleton instance
export const eventBus = new EventBus();
