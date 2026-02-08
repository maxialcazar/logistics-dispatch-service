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
}

const SocketContext = createContext<SocketContextData>({
  isConnected: false,
  locations: new Map(),
});

export function SocketProvider({ children, token }: { children: React.ReactNode, token: string | null }) {
  const [isConnected, setIsConnected] = useState(false);
  const [locations, setLocations] = useState<Map<string, DriverLocation>>(new Map());

  useEffect(() => {
    if (!token) return;

    // Connect socket
    socketService.connect(token);
    const socket = socketService.socket;

    if (!socket) return;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    // Core Logic: Listen for driver updates
    socket.on('driver-location-updated', (data: DriverLocation) => {
        setLocations((prev) => {
            const newMap = new Map(prev);
            newMap.set(data.driverId, data);
            return newMap;
        });
    });

    return () => {
        socket.off('driver-location-updated');
        socketService.disconnect();
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ isConnected, locations }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
