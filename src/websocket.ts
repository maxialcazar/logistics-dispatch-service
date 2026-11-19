import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import logger from "./utils/logger";
import { eventBus } from "./services/event.service";

import jwt from "jsonwebtoken";

let io: Server;

function resolveSocketCorsOrigin(): string | string[] {
	const rawCorsOrigin = process.env.CORS_ORIGIN?.trim();
	if (!rawCorsOrigin) {
		return ["http://localhost:5173", "http://localhost:8080"];
	}
	if (rawCorsOrigin === "*") {
		return "*";
	}
	const origins = rawCorsOrigin
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	return origins.length > 0 ? origins : ["http://localhost:5173", "http://localhost:8080"];
}

function handleDriverLocationUpdated(data: any) {
	if (io && data?.companyId) {
		// Re-broadcast ONLY to Company Room (Data Privacy Enforcement)
		io.to(`company-${data.companyId}`).emit("driver-location-updated", data);
	}
}

export function initSocket(server: HttpServer) {
	const corsOrigin = resolveSocketCorsOrigin();

	io = new Server(server, {
		cors: {
			origin: corsOrigin,
			methods: ["GET", "POST"],
			...(corsOrigin !== "*" ? { credentials: true } : {}),
		},
	});

	// Use the Singleton EventBus instead of opening a new Redis connection (deduplicated)
	eventBus.off("driver.location.updated", handleDriverLocationUpdated);
	eventBus.on("driver.location.updated", handleDriverLocationUpdated);

	io.on("connection", (socket) => {
		logger.info(`🔌 Client connected: ${socket.id}`);

		const rawToken = socket.handshake.auth?.token;
		const token = typeof rawToken === "string" ? rawToken.trim() : "";
		const jwtSecret = process.env.JWT_SECRET;

		if (!token || !jwtSecret) {
			logger.warn(`⚠️ Client ${socket.id} missing auth token or server secret, disconnecting.`);
			socket.disconnect(true);
			return;
		}

		try {
			const decoded = jwt.verify(token, jwtSecret) as any;
			if (
				typeof decoded?.companyId !== "string" ||
				!decoded.companyId.trim() ||
				typeof decoded?.userId !== "string" ||
				!decoded.userId.trim() ||
				typeof decoded?.role !== "string" ||
				!decoded.role.trim()
			) {
				logger.warn(`⚠️ Client ${socket.id} token missing required claims, disconnecting.`);
				socket.disconnect(true);
				return;
			}

			const companyId = decoded.companyId.trim();
			const room = `company-${companyId}`;
			socket.join(room);
			logger.info(`🔐 Client ${socket.id} joined secure room: ${room}`);

			const driverName =
				typeof decoded.username === "string" && decoded.username.trim()
					? decoded.username.trim()
					: undefined;
			const driverIdentifier = decoded.driverId || decoded.userId || decoded.id;

			if (decoded.role === "driver") {
				// Notify company that driver is online
				io.to(room).emit("driver-status-updated", {
					driverId: driverIdentifier,
					status: "online",
					name: driverName,
				});
			}

			socket.on("disconnect", () => {
				logger.info(`🔌 Client disconnected: ${socket.id}`);
				if (decoded.role === "driver") {
					io.to(room).emit("driver-status-updated", {
						driverId: driverIdentifier,
						status: "offline",
						name: driverName,
					});
				}
			});
		} catch {
			logger.warn(`⚠️ Client ${socket.id} provided invalid token, disconnecting.`);
			socket.disconnect(true);
		}
	});

	return io;
}

export function getIO() {
	if (!io) {
		throw new Error("Socket.io not initialized");
	}
	return io;
}

export function emitToRoom(room: string, event: string, data: any) {
	if (io) {
		io.to(room).emit(event, data);
	}
}

export function getTenantConnectedClientCount(companyId: string): number {
	if (!io || typeof companyId !== "string" || !companyId.trim()) return 0;
	const rooms = io.sockets?.adapter?.rooms;
	return rooms?.get(`company-${companyId.trim()}`)?.size ?? 0;
}

export function getGlobalConnectedClientCount(): number {
	return io ? io.engine.clientsCount : 0;
}

export function getConnectedClientCount(companyId?: string): number {
	if (companyId !== undefined) {
		return getTenantConnectedClientCount(companyId);
	}
	return getGlobalConnectedClientCount();
}
