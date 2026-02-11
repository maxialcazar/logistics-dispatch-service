import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import logger from "./utils/logger";
import { eventBus } from "./services/event.service";

import jwt from "jsonwebtoken";

let io: Server;

export function initSocket(server: HttpServer) {
	io = new Server(server, {
		cors: {
			origin: "*", 
			methods: ["GET", "POST"],
		},
	});

	// Use the Singleton EventBus instead of opening a new Redis connection
	eventBus.on("driver.location.updated", (data: any) => {
			if (data.companyId) {
				// Re-broadcast ONLY to Company Room (Data Privacy Enforcement)
				io.to(`company-${data.companyId}`).emit("driver-location-updated", data);
			}
	});

	io.on("connection", (socket) => {
		logger.info(`🔌 Client connected: ${socket.id}`);

        // Secure Room Joining via JWT
        const token = socket.handshake.auth.token;
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
                if (decoded.companyId) {
                    const room = `company-${decoded.companyId}`;
                    socket.join(room);
                    logger.info(`🔐 Client ${socket.id} joined secure room: ${room}`);

                    if (decoded.role === 'driver') {
                         // Notify company that driver is online
                         io.to(room).emit('driver-status-updated', { 
                             driverId: decoded.id || decoded.userId, // JWT usually has id/userId
                             status: 'online',
                             name: decoded.username 
                         });
                    }

                    socket.on("disconnect", () => {
			            logger.info(`🔌 Client disconnected: ${socket.id}`);
                        if (decoded.role === 'driver') {
                             io.to(room).emit('driver-status-updated', { 
                                 driverId: decoded.id || decoded.userId, 
                                 status: 'offline',
                                 name: decoded.username 
                             });
                        }
		            });
                }
            } catch (error) {
                logger.warn(`⚠️ Client ${socket.id} provided invalid token, denied room access.`);
                socket.on("disconnect", () => {
			        logger.info(`🔌 Client disconnected: ${socket.id}`);
		        });
            }
        } else {
             socket.on("disconnect", () => {
			    logger.info(`🔌 Client disconnected: ${socket.id}`);
		    });
        }
		
		// socket.on("join-room", ... ) // Removed/Legacy
	});

	return io;
}

export function getIO() {
	if (!io) {
		throw new Error("Socket.io not initialized");
	}
	return io;
}

export function emitToAll(event: string, data: any) {
	if (io) {
		io.emit(event, data);
	}
}

export function emitToRoom(room: string, event: string, data: any) {
	if (io) {
		io.to(room).emit(event, data);
	}
}

export function getConnectedClientCount() {
	return io ? io.engine.clientsCount : 0;
}
