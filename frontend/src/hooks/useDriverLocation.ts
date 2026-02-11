import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService } from '../services/driverService';
import { toast } from 'sonner';

export function useDriverLocation() {
    const { token, user } = useAuth();
    const isDriver = user?.role === 'driver';

    useEffect(() => {
        if (!token || !isDriver) return;

        console.log("📍 Starting Location Tracking...");

        const success = (pos: GeolocationPosition) => {
            const { latitude, longitude } = pos.coords;
            // Throttle? The service/backend should handle high frequency, 
            // but navigator.watchPosition can be chatty. 
            // Redis write-back buffer handles backend load.
            driverService.updateLocation(token, latitude, longitude).catch(err => {
                console.error("Failed to update location", err);
            });
        };

        const error = (err: GeolocationPositionError) => {
            console.warn("Location tracking error:", err);
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
            console.log("📍 Stopping Location Tracking...");
            navigator.geolocation.clearWatch(watchId);
        };
    }, [token, isDriver]);
}
