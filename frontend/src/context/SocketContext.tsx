import { createContext, useContext, useEffect, useState } from 'react';
import { socketService } from '../services/socket';

interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  timestamp: number;
}

interface SocketContextData {
  isConnected: boolean;
  locations: Map<string, DriverLocation>;
  socket: any; // Expose socket instance directly
}

const SocketContext = createContext<SocketContextData>({
  isConnected: false,
  locations: new Map(),
  socket: null,
});

export function SocketProvider({ children, token }: { children: React.ReactNode, token: string | null }) {
  const [isConnected, setIsConnected] = useState(false);
  const [locations, setLocations] = useState<Map<string, DriverLocation>>(new Map());
  // We can just use the socketService.socket directly or state, but socketService is singleton-ish
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

    return () => {
        sock.off('driver-location-updated');
        sock.off('disconnect');
        sock.off('connect');
        socketService.disconnect();
    };
  }, [token]); 

  return (
    <SocketContext.Provider value={{ isConnected, locations, socket: socketService.socket }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
