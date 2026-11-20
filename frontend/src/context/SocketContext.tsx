import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { socketService } from '../services/socket';

interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  timestamp: number;
}

interface AppEvent {
  id: string;
  type: 'DELIVERY' | 'ISSUE' | 'SYSTEM' | 'LOCATION';
  title: string;
  description: string;
  timestamp: number;
}

interface SocketContextData {
  isConnected: boolean;
  locations: Map<string, DriverLocation>;
  events: AppEvent[];
  socket: Socket | null;
}

interface ConnectionState {
  token: string;
  socket: Socket;
  connected: boolean;
}

const SocketContext = createContext<SocketContextData>({
  isConnected: false,
  locations: new Map(),
  events: [],
  socket: null,
});

export function SocketProvider({ children, token }: { children: React.ReactNode; token: string | null }) {
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [locations, setLocations] = useState<Map<string, DriverLocation>>(new Map());
  const [events, setEvents] = useState<AppEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!token) {
      socketRef.current = null;
      socketService.disconnect();
      queueMicrotask(() => {
        if (!isActive) return;
        setConnectionState((prev) => (prev === null ? prev : null));
        setLocations((prev) => (prev.size === 0 ? prev : new Map()));
        setEvents((prev) => (prev.length === 0 ? prev : []));
      });
      return () => {
        isActive = false;
      };
    }

    const activeSocket = socketService.connect(token);
    socketRef.current = activeSocket;

    const syncConnectionState = (connected: boolean) => {
      if (!isActive || socketRef.current !== activeSocket) return;
      setConnectionState((prev) =>
        prev?.token === token && prev.socket === activeSocket && prev.connected === connected
          ? prev
          : { token, socket: activeSocket, connected }
      );
    };

    const handleConnect = () => syncConnectionState(true);
    const handleDisconnect = () => syncConnectionState(false);
    const handleConnectError = () => syncConnectionState(false);

    // Core Logic: Listen for driver updates
    const handleDriverLocationUpdated = (data: DriverLocation) => {
      if (!isActive || socketRef.current !== activeSocket) return;
      setLocations((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.driverId, data);
        return newMap;
      });
    };

    // Listen for business events
    const handleBusinessEvent = (event: AppEvent) => {
      if (!isActive || socketRef.current !== activeSocket) return;
      setEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50 events
    };

    activeSocket.on('connect', handleConnect);
    activeSocket.on('disconnect', handleDisconnect);
    activeSocket.on('connect_error', handleConnectError);
    activeSocket.on('driver-location-updated', handleDriverLocationUpdated);
    activeSocket.on('business-event', handleBusinessEvent);

    queueMicrotask(() => {
      if (!isActive || socketRef.current !== activeSocket) return;
      setConnectionState((prev) => {
        if (prev?.token === token && prev.socket === activeSocket) {
          return prev;
        }
        return { token, socket: activeSocket, connected: activeSocket.connected };
      });
    });

    return () => {
      isActive = false;
      activeSocket.off('connect', handleConnect);
      activeSocket.off('disconnect', handleDisconnect);
      activeSocket.off('connect_error', handleConnectError);
      activeSocket.off('driver-location-updated', handleDriverLocationUpdated);
      activeSocket.off('business-event', handleBusinessEvent);
      if (socketRef.current === activeSocket) {
        socketRef.current = null;
      }
      socketService.disconnect();
    };
  }, [token]);

  const activeContextSocket = token && connectionState?.token === token ? connectionState.socket : null;
  const isConnected = Boolean(activeContextSocket) && Boolean(connectionState?.connected);

  const value = useMemo(
    () => ({ isConnected, locations, events, socket: activeContextSocket }),
    [isConnected, locations, events, activeContextSocket]
  );

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocket() {
  return useContext(SocketContext);
}
