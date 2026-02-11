import { createContext, useContext, useEffect, useState } from 'react';
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
  socket: any; 
}

const SocketContext = createContext<SocketContextData>({
  isConnected: false,
  locations: new Map(),
  events: [],
  socket: null,
});

export function SocketProvider({ children, token }: { children: React.ReactNode, token: string | null }) {
  const [isConnected, setIsConnected] = useState(false);
  const [locations, setLocations] = useState<Map<string, DriverLocation>>(new Map());
  const [events, setEvents] = useState<AppEvent[]>([]);
  const sock = socketService.socket;

  useEffect(() => {
    if (!token) return;

    socketService.connect(token);

    if (!sock) return;

    sock.on('connect', () => setIsConnected(true));
    sock.on('disconnect', () => setIsConnected(false));
    
    // Core Logic: Listen for driver updates
    sock.on('driver-location-updated', (data: DriverLocation) => {
        setLocations((prev) => {
            const newMap = new Map(prev);
            newMap.set(data.driverId, data);
            return newMap;
        });
    });

    // Listen for business events
    sock.on('business-event', (event: AppEvent) => {
        setEvents(prev => [event, ...prev].slice(0, 50)); // Keep last 50 events
    });

    return () => {
        sock.off('driver-location-updated');
        sock.off('business-event');
        sock.off('disconnect');
        sock.off('connect');
        socketService.disconnect();
    };
  }, [token]); 

  return (
    <SocketContext.Provider value={{ isConnected, locations, events, socket: socketService.socket }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
