import { io, Socket } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || undefined; // Use window origin (proxy) by default

class SocketService {
  public socket: Socket | null = null;

  connect(token: string) {
    if (this.socket) return;

    this.socket = io(URL, {
      auth: { token },
      transports: ['websocket', 'polling'], // Fallback options
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to WebSocket service', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ WebSocket Connection Error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
        console.warn('⚠️ WebSocket Disconnected:', reason);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Generic typed event listener
  on<T>(event: string, callback: (data: T) => void) {
      if (!this.socket) return;
      this.socket.on(event, callback);
  }

  off(event: string) {
      if (!this.socket) return;
      this.socket.off(event);
  }
}

export const socketService = new SocketService();
