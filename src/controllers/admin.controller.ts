import { Request, Response } from "express";
import { prisma } from "../prisma";
import { redis } from "../redis";
import { getConnectedClientCount } from "../websocket";
import { eventBus } from "../services/event.service";

export async function getSystemMetrics(req: Request, res: Response) {
  const uptime = process.uptime();
  
  // Memory usage
  const memory = process.memoryUsage();
  
  // Database Check
  let dbStatus = "ok";
  const startDb = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    dbStatus = "error";
  }
  const dbLatency = Date.now() - startDb;

  // Redis Check
  let redisStatus = "ok";
  let redisPing = -1;
  if (process.env.REDIS_ENABLED === 'true') {
     const startRedis = Date.now();
     try {
       const pong = await redis.get("ping_test"); 
       // Note: redis.get returns null if not found, checking raw connection might be better but this proves read access.
     } catch (e) {
       redisStatus = "error";
     }
     redisPing = Date.now() - startRedis;
  } else {
     redisStatus = "disabled";
  }

  res.json({
    status: "online",
    uptime: `${Math.floor(uptime)}s`,
    timestamp: new Date().toISOString(),
    resources: {
      memory_rss_mb: Math.round(memory.rss / 1024 / 1024),
      memory_heap_mb: Math.round(memory.heapUsed / 1024 / 1024),
    },
    components: {
      database: {
        status: dbStatus,
        latency_ms: dbLatency
      },
      redis: {
        status: redisStatus,
        latency_ms: redisPing,
        // eventBusConnected: eventBus.isConnected // accessing private if not exposed, let's skip for now or make public
      },
      websockets: {
        connected_clients: getConnectedClientCount()
      }
    }
  });
}
