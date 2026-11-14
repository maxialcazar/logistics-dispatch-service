import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService } from '../services/driverService';
import { toast } from 'sonner';

export function useDriverLocation() {
    const { token, user } = useAuth();
    const isDriver = user?.role === 'driver';
    const lastUpdate = useRef<number>(0);

    useEffect(() => {
        if (!token || !isDriver) return;

        const success = (pos: GeolocationPosition) => {
            // Skip location updates when offline — no point trying to reach the server
            if (!navigator.onLine) return;

            const now = Date.now();
            // Throttle: Only update every 10 seconds
            if (now - lastUpdate.current < 10000) return;

            const { latitude, longitude } = pos.coords;
            lastUpdate.current = now;

            driverService.updateLocation(token, latitude, longitude).catch(() => {
                // Silent fail — the network may be briefly unstable
            });
        };

        const error = (err: GeolocationPositionError) => {
            if (err.code === 1) { // PERMISSION_DENIED
                toast.error("Habilita la ubicación para aparecer en el mapa.");
            }
        };

        const options = {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 10000,
        };

        const watchId = navigator.geolocation.watchPosition(success, error, options);

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, [token, isDriver]);
}
