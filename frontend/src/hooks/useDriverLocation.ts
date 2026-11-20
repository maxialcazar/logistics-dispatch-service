import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService } from '../services/driverService';
import { toast } from 'sonner';

export interface DriverCoordinates {
    lat: number;
    lng: number;
}

interface TrackedLocation extends DriverCoordinates {
    updatedAt: number;
}

export interface UseDriverLocationResult {
    getCurrentLocation: () => Promise<DriverCoordinates | null>;
}

const SERVER_UPDATE_THROTTLE_MS = 10_000;
const FRESH_LOCATION_MAX_AGE_MS = 10_000;
const FALLBACK_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const GEOLOCATION_CAPTURE_TIMEOUT_MS = 3_000;
const GEOLOCATION_CAPTURE_MAX_AGE_MS = 30_000;

function isValidCoordinates(lat: number, lng: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

export function useDriverLocation(): UseDriverLocationResult {
    const { token, user } = useAuth();
    const isDriver = user?.role === 'driver';
    const lastUpdate = useRef<number>(0);
    const latestLocationRef = useRef<TrackedLocation | null>(null);

    useEffect(() => {
        if (!token || !isDriver) {
            latestLocationRef.current = null;
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            return;
        }

        const success = (pos: GeolocationPosition) => {
            const { latitude, longitude } = pos.coords;
            const hasValidCoords = isValidCoordinates(latitude, longitude);

            // Keep the latest valid fix cached locally even while offline or throttled
            if (hasValidCoords) {
                latestLocationRef.current = {
                    lat: latitude,
                    lng: longitude,
                    updatedAt: Date.now(),
                };
            }

            // Skip location updates when offline — no point trying to reach the server
            if (!navigator.onLine || !hasValidCoords) return;

            const now = Date.now();
            // Throttle: Only update every 10 seconds
            if (now - lastUpdate.current < SERVER_UPDATE_THROTTLE_MS) return;

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

        const options: PositionOptions = {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 10000,
        };

        const watchId = navigator.geolocation.watchPosition(success, error, options);

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, [token, isDriver]);

    const getValidLastKnown = useCallback((maxAgeMs: number): DriverCoordinates | null => {
        const cached = latestLocationRef.current;
        if (!cached) return null;
        if (Date.now() - cached.updatedAt > maxAgeMs) return null;
        return { lat: cached.lat, lng: cached.lng };
    }, []);

    /**
     * Resolves current driver coordinates without rejecting or stalling delivery flows.
     */
    const getCurrentLocation = useCallback(async (): Promise<DriverCoordinates | null> => {
        const fresh = getValidLastKnown(FRESH_LOCATION_MAX_AGE_MS);
        if (fresh) {
            return fresh;
        }

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            return getValidLastKnown(FALLBACK_LOCATION_MAX_AGE_MS);
        }

        return new Promise<DriverCoordinates | null>((resolve) => {
            let settled = false;

            const safetyTimer = setTimeout(() => {
                finish(getValidLastKnown(FALLBACK_LOCATION_MAX_AGE_MS));
            }, GEOLOCATION_CAPTURE_TIMEOUT_MS + 500);

            function finish(coords: DriverCoordinates | null) {
                if (settled) return;
                settled = true;
                clearTimeout(safetyTimer);
                resolve(coords);
            }

            try {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude } = pos.coords;
                        if (isValidCoordinates(latitude, longitude)) {
                            const coords = { lat: latitude, lng: longitude };
                            latestLocationRef.current = {
                                ...coords,
                                updatedAt: Date.now(),
                            };
                            finish(coords);
                            return;
                        }
                        finish(getValidLastKnown(FALLBACK_LOCATION_MAX_AGE_MS));
                    },
                    () => {
                        finish(getValidLastKnown(FALLBACK_LOCATION_MAX_AGE_MS));
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: GEOLOCATION_CAPTURE_TIMEOUT_MS,
                        maximumAge: GEOLOCATION_CAPTURE_MAX_AGE_MS,
                    }
                );
            } catch {
                finish(getValidLastKnown(FALLBACK_LOCATION_MAX_AGE_MS));
            }
        });
    }, [getValidLastKnown]);

    return { getCurrentLocation };
}
