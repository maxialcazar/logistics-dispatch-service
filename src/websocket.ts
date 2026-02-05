import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import logger from "./utils/logger";

let io: Server;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);

    socket.on("join-room", (room: string) => {
      socket.join(room);
      logger.info(`🏠 Client ${socket.id} joined room: ${room}`);
    });

    socket.on("disconnect", () => {
      logger.info(`🔌 Client disconnected: ${socket.id}`);
    });
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
