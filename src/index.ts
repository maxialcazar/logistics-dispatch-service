import { createServer } from "http";
import app from "./app";
import { closeDatabase } from "./prisma";
import { redis } from "./redis";
import { initSocket } from "./websocket";
import { env } from "./config/env";
import { eventBus } from "./services/event.service";
import { DriverService } from "./services/driver.service";

const PORT = env.PORT;
const SYNC_INTERVAL_MS = 5000;
const SHUTDOWN_HTTP_TIMEOUT_MS = 5000;

export const httpServer = createServer(app);
export const io = initSocket(httpServer);

let syncInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;
let signalHandlersRegistered = false;

/**
 * Starts the periodic background sync worker that flushes buffered driver locations to PostgreSQL.
 */
export function startLocationSyncInterval(intervalMs = SYNC_INTERVAL_MS): NodeJS.Timeout | null {
	if (isShuttingDown) return null;
	if (syncInterval) return syncInterval;

	syncInterval = setInterval(async () => {
		if (isShuttingDown) return;
		try {
			await DriverService.syncLocationBuffer();
		} catch (e) {
			console.error("Sync Error:", e);
		}
	}, intervalMs);

	return syncInterval;
}

/**
 * Stops the background location sync interval if active.
 */
export function stopLocationSyncInterval(): void {
	if (syncInterval) {
		clearInterval(syncInterval);
		syncInterval = null;
	}
}

function registerSignalHandlers(): void {
	if (signalHandlersRegistered) return;
	signalHandlersRegistered = true;

	process.on("SIGTERM", () => {
		void gracefulShutdown("SIGTERM");
	});
	process.on("SIGINT", () => {
		void gracefulShutdown("SIGINT");
	});
}

/**
 * Initializes the event bus, HTTP server, and background workers.
 */
export function startServer(port: number = PORT) {
	if (isShuttingDown) return httpServer;

	void eventBus.init();
	registerSignalHandlers();

	return httpServer.listen(port, () => {
		console.log(`Server running on http://localhost:${port}`);

		// Start Background Workers
		console.log("🛠️  Starting Background Sync Worker (Redis -> DB)...");
		startLocationSyncInterval();
	});
}

function closeHttpAndSocketServer(): Promise<void> {
	return new Promise((resolve) => {
		if (!httpServer.listening) {
			io.close(() => resolve());
			return;
		}

		const forceTimeout = setTimeout(() => {
			console.warn("HTTP server close timed out; forcing remaining connections closed");
			httpServer.closeAllConnections?.();
			resolve();
		}, SHUTDOWN_HTTP_TIMEOUT_MS);
		forceTimeout.unref?.();

		io.close((err) => {
			clearTimeout(forceTimeout);
			if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
				console.error("Error closing HTTP/Socket server:", err);
			}
			resolve();
		});

		httpServer.closeIdleConnections?.();
	});
}

/**
 * Idempotent graceful shutdown: stops sync timer, drains HTTP/WS, flushes location buffer,
 * and closes PostgreSQL pool, Redis, and EventBus.
 */
export async function gracefulShutdown(signal: string): Promise<void> {
	if (shutdownPromise) {
		return shutdownPromise;
	}

	shutdownPromise = (async () => {
		console.log(`\n${signal} signal received: closing HTTP server`);
		isShuttingDown = true;
		stopLocationSyncInterval();

		let hasError = false;

		await closeHttpAndSocketServer();
		console.log("HTTP server closed");

		try {
			await DriverService.waitForActiveSync();
			await DriverService.syncLocationBuffer().catch((e) => {
				console.error("Final Sync Error:", e);
			});
		} catch (err) {
			hasError = true;
			console.error("Error waiting for active location sync during shutdown", err);
		}

		try {
			await closeDatabase();
			console.log("📦 Prisma disconnected and PostgreSQL pool closed");
		} catch (err) {
			hasError = true;
			console.error("Error closing database connections", err);
		}

		try {
			await redis.disconnect();
		} catch (err) {
			hasError = true;
			console.error("Error disconnecting Redis", err);
		}

		try {
			await eventBus.close();
		} catch (err) {
			hasError = true;
			console.error("Error closing EventBus", err);
		}

		process.exit(hasError ? 1 : 0);
	})();

	return shutdownPromise;
}

const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.JEST_WORKER_ID);
if (!isTestEnv || require.main === module) {
	startServer();
}