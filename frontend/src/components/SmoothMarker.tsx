
import { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import type { MarkerProps } from 'react-leaflet';
import L from 'leaflet';

/**
 * SmoothMarker: A wrapper for react-leaflet Marker that animates position updates.
 * Instead of jumping instantly to new coordinates, it interpolates movement 
 * on every animation frame (60fps), creating a buttery smooth visual effect.
 */
export function SmoothMarker({ position, ...props }: MarkerProps) {
  const markerRef = useRef<L.Marker>(null);
  const targetPos = useRef(position);
  
  // 1. Update our "target" whenever the parent passes a new position prop
  useEffect(() => {
    targetPos.current = position;
  }, [position]);

  // 2. The Animation Loop (runs outside React render cycle for performance)
  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      const marker = markerRef.current;
      if (marker) {
        const currentLatLng = marker.getLatLng();
        
        // Handle both [lat, lng] array and {lat, lng} object formats
        const targetLat = Array.isArray(targetPos.current) ? targetPos.current[0] : (targetPos.current as any).lat;
        const targetLng = Array.isArray(targetPos.current) ? targetPos.current[1] : (targetPos.current as any).lng;

        // LERP Factor (Linear Interpolation)
        // 0.05 = Move 5% of the remaining distance every frame.
        // This creates an "Ease-Out" effect: fast start, slow stop.
        // Even with updates every 1-2 seconds, this looks continuous.
        const factor = 0.05; 

        // Compute new interpolated position
        const newLat = currentLatLng.lat + (targetLat - currentLatLng.lat) * factor;
        const newLng = currentLatLng.lng + (targetLng - currentLatLng.lng) * factor;

        // Apply update only if we haven't reached the target (to save CPU)
        if (Math.abs(newLat - targetLat) > 0.000001 || Math.abs(newLng - targetLng) > 0.000001) {
            marker.setLatLng([newLat, newLng]);
        }
      }
      // Loop forever
      animationFrameId = requestAnimationFrame(animate);
    };

    // Start loop
    animationFrameId = requestAnimationFrame(animate);

    // Cleanup on unmount
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // 3. Render the Leaflet Marker
  // We lock the 'position' prop to the initial value so React doesn't try 
  // to re-render the marker on every update. We handle updates manually via ref.
  const [initialPosition] = useState(position);

  return <Marker ref={markerRef} position={initialPosition} {...props} />;
}
