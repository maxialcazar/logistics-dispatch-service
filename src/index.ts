import { createServer } from "http";
import app from "./app";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { initSocket } from "./websocket";

import { env } from "./config/env";

const PORT = env.PORT;

const httpServer = createServer(app);
const io = initSocket(httpServer);

import { eventBus } from "./services/event.service";
import { DriverService } from "./services/driver.service";

// ...

// Init Event Bus
eventBus.init();

let syncTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

function scheduleNextSync() {
    if (isShuttingDown) return;
    syncTimer = setTimeout(async () => {
        try {
            await DriverService.syncLocationBuffer();
        } catch (e) {
            console.error("Sync Error:", e);
        } finally {
            scheduleNextSync();
        }
    }, 5000);
}

const server = httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Start Background Workers
    console.log("🛠️  Starting Background Sync Worker (Redis -> DB)...");
    scheduleNextSync();
});

async function gracefulShutdown(signal: string) {
	console.log(`\n${signal} signal received: closing HTTP server`);
	isShuttingDown = true;
	if (syncTimer) {
		clearTimeout(syncTimer);
		syncTimer = null;
	}
	server.close(async () => {
		console.log('HTTP server closed');
		try {
			await DriverService.waitForActiveSync();
			await DriverService.syncLocationBuffer().catch(e => console.error("Final Sync Error:", e));
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