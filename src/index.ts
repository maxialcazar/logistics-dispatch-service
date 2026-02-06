import { createServer } from "http";
import app from "./app";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { initSocket } from "./websocket";

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);
const io = initSocket(httpServer);

import { eventBus } from "./services/event.service";

// ...

// Init Event Bus
eventBus.init();

const server = httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} signal received: closing HTTP server`);
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await prisma.$disconnect();
      console.log('📦 Prisma disconnected');
      await redis.disconnect();
      await eventBus.close();
      process.exit(0);
    } catch (err) {
      console.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));