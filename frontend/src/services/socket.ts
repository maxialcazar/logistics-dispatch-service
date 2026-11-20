import { io, Socket } from 'socket.io-client';

// Use relative path by default to let Nginx handle proxying
const URL = import.meta.env.VITE_API_URL || undefined;

class SocketService {
  public socket: Socket | null = null;
  private currentToken: string | null = null;

  connect(token: string): Socket {
    if (this.socket) {
      const currentAuthToken =
        typeof this.socket.auth === 'object' && this.socket.auth !== null
          ? (this.socket.auth as { token?: unknown }).token
          : undefined;
      const tokenChanged = this.currentToken !== token || currentAuthToken !== token;

      this.currentToken = token;
      this.socket.auth = { token };

      if (tokenChanged) {
        if (this.socket.connected || this.socket.active) {
          this.socket.disconnect();
        }
        this.socket.connect();
      } else if (!this.socket.connected) {
        this.socket.connect();
      }

      return this.socket;
    }

    this.currentToken = token;
    this.socket = io(URL, {
      path: '/socket.io', // Explicitly set path often helps with Nginx
      auth: { token },
      transports: ['websocket', 'polling'], // Fallback options
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
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

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.currentToken = null;
  }

  // Generic typed event listener
  on<T>(event: string, callback: (data: T) => void) {
      if (!this.socket) return;
      this.socket.on(event, callback);
  }

  off<T>(event: string, callback?: (data: T) => void) {
      if (!this.socket) return;
      if (callback) {
          this.socket.off(event, callback);
      } else {
          this.socket.off(event);
      }
  }
}

export const socketService = new SocketService();
